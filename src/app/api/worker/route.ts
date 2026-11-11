import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
import { generateAgencyText } from '@/lib/intelligence/model-runtime';
import { processAutomationRun } from '@/lib/intelligence/automation-processor.mjs';
import { isAuthorizedWorkerRequest } from '@/lib/security/worker-auth.mjs';
import { getAgencyModelRuntimeReadiness } from '@/lib/intelligence/runtime-config.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasValidWorkerSecret(request: Request) {
  return isAuthorizedWorkerRequest(request.headers.get('authorization'), process.env.CRON_SECRET);
}



function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function loadEvidence(db: any, jobType: string, config: Record<string, unknown>, input: Record<string, unknown>) {
  const suppliedEvidence = asObject(input.evidence);
  const rawProspectId = input.prospect_id ?? config.prospect_id;
  if (rawProspectId != null && String(rawProspectId).trim() && !UUID.test(String(rawProspectId))) {
    throw new Error('The prospect reference is invalid.');
  }
  const prospectId = rawProspectId == null ? '' : String(rawProspectId);
  if (!prospectId) return suppliedEvidence;

  const prospects = await db`
    SELECT id,business_name,website_url,category,city,country,source,source_url,
           website_status,opportunity_score,research_summary,status
    FROM public.prospects
    WHERE id = ${prospectId}
    LIMIT 1
  ` as Array<Record<string, any>>;
  if (!prospects[0]) throw new Error('The referenced prospect was not found.');
  const evidence: Record<string, unknown> = { ...suppliedEvidence, prospect: prospects[0] };

  if (jobType === 'seo_monitoring' || jobType === 'prospect_research' || jobType === 'report_generation') {
    const audits = await db`
      SELECT id,website_url,overall_score,findings,recommendations,provider,verified_at
      FROM public.seo_audits
      WHERE prospect_id = ${prospectId}
      ORDER BY verified_at DESC NULLS LAST,created_at DESC
      LIMIT 1
    ` as Array<Record<string, any>>;
    if (audits[0]) evidence.latest_website_audit = audits[0];
  }
  return evidence;
}

async function complete(db: any, runId: string, leaseToken: string, status: 'succeeded' | 'failed', result: unknown, errorMessage: string | null) {
  const rows = await db`
    SELECT public.complete_automation_run(
      ${runId}::uuid,
      ${leaseToken}::uuid,
      ${status},
      ${result == null ? null : JSON.stringify(result)}::jsonb,
      ${errorMessage}
    ) AS status
  ` as Array<{ status?: unknown }>;
  return typeof rows[0]?.status === 'string' ? rows[0].status : null;
}

export async function POST(request: Request) {
  if (!hasValidWorkerSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized worker request.' }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Worker database is not configured.' }, { status: 503 });
  }
  if (!getAgencyModelRuntimeReadiness().configured) {
    return NextResponse.json({ error: 'An approved AI model runtime is not configured. No runs were claimed.' }, { status: 503 });
  }

  let requestedBatch = 2;
  try {
    const body = await request.json();
    if (Number.isInteger(body?.batch_size)) requestedBatch = Number(body.batch_size);
  } catch {
    // An empty request body is valid; the worker uses the conservative default.
  }
  const batchSize = Math.max(1, Math.min(3, requestedBatch));
  const workerId = `agencyos-worker-${randomUUID()}`;
  const db = neon(process.env.DATABASE_URL);

  try {
    const claimed = await db`
      SELECT * FROM public.claim_automation_runs(
        ${workerId},
        ${batchSize},
        180
      )
    ` as Array<Record<string, any>>;

    const outcomes: Array<Record<string, unknown>> = [];
    for (const run of claimed) {
      const runId = String(run.id);
      const leaseToken = String(run.lease_token ?? '');
      if (!UUID.test(runId) || !UUID.test(leaseToken)) {
        outcomes.push({ runId, status: 'invalid_claim_response' });
        continue;
      }

      try {
        const jobs = await db`
          SELECT id,job_type,title,status,config,max_attempts
          FROM public.automation_jobs
          WHERE id = ${run.job_id}
          LIMIT 1
        ` as Array<Record<string, any>>;
        const job = jobs[0];
        if (!job) throw new Error('The automation job definition no longer exists.');
        if (job.status !== 'active') throw new Error('The automation job was paused before processing.');

        const config = asObject(job.config);
        const input = asObject(run.input);
        const evidence = await loadEvidence(db, String(job.job_type), config, input);
        const processed = await processAutomationRun({
          jobType: String(job.job_type),
          title: String(job.title),
          config,
          input,
          evidence,
          generate: generateAgencyText,
        });
        const terminalStatus = await complete(db, runId, leaseToken, 'succeeded', processed, null);
        outcomes.push({
          runId,
          status: terminalStatus ?? 'lease_lost',
          model: processed.model,
        });
      } catch {
        // Keep provider, database and customer data out of worker responses.
        try {
          const retryStatus = await complete(
            db,
            runId,
            leaseToken,
            'failed',
            null,
            'Internal automation processing failed. Review configuration/evidence and retry.',
          );
          outcomes.push({ runId, status: retryStatus ?? 'lease_lost' });
        } catch {
          outcomes.push({ runId, status: 'completion_unavailable' });
        }
      }
    }

    return NextResponse.json({
      workerId,
      claimed: claimed.length,
      processed: outcomes.length,
      outcomes,
      externalActionsEnabled: false,
    });
  } catch {
    return NextResponse.json({ error: 'The worker could not claim or process automation runs.' }, { status: 503 });
  }
}
