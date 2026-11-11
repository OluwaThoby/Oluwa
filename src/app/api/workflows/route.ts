import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { isValidCron } from '@/lib/cron-validation.mjs';
import { nextCronOccurrence } from '@/lib/cron-schedule.mjs';
import { getAgencyModelRuntimeReadiness } from '@/lib/intelligence/runtime-config.mjs';

export const dynamic = 'force-dynamic';

const ALLOWED_JOB_TYPES = new Set([
  'prospect_research',
  'seo_monitoring',
  'client_followup',
  'invoice_reminder',
  'report_generation',
  'general',
]);

async function isOwner() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(
    email &&
    process.env.OWNER_EMAIL &&
    email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase()
  );
}

export async function GET() {
  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    const db = neon(process.env.DATABASE_URL);
    const [jobs, runs, workerFunctions] = await Promise.all([
      db`SELECT id,job_type,title,status,schedule_cron,timezone,config,next_run_at,last_run_at,max_attempts,consecutive_failures,created_at
          FROM public.automation_jobs ORDER BY created_at DESC LIMIT 100`,
      db`SELECT id,job_id,job_type,status,attempt_count,error_message,started_at,finished_at,created_at
          FROM public.automation_runs ORDER BY created_at DESC LIMIT 100`,
      db`SELECT
          to_regprocedure('public.claim_automation_runs(text,integer,integer)') IS NOT NULL AS automation_claim,
          to_regprocedure('public.complete_automation_run(uuid,uuid,text,jsonb,text)') IS NOT NULL AS automation_complete,
          to_regprocedure('public.claim_agent_tasks(text,integer,integer)') IS NOT NULL AS agent_claim,
          to_regprocedure('public.complete_agent_task(uuid,uuid,text,jsonb,text)') IS NOT NULL AS agent_complete,
          to_regprocedure('public.materialize_scheduled_automation_run(uuid,timestamptz,timestamptz)') IS NOT NULL AS scheduler
        `,
    ]);
    const ready = workerFunctions[0];
    const executionEnabled = process.env.WORKER_EXECUTION_ENABLED === 'true' &&
      Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 32) &&
      getAgencyModelRuntimeReadiness().configured &&
      Boolean(ready?.automation_claim && ready?.automation_complete && ready?.agent_claim && ready?.agent_complete && ready?.scheduler);
    return NextResponse.json({ jobs, runs, execution_enabled: executionEnabled });
  } catch {
    return NextResponse.json({ error: 'Could not load workflow centre.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    const body = await req.json();
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const status = body.status;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
        !['active', 'paused'].includes(status)) {
      return NextResponse.json({ error: 'A valid workflow ID and active/paused status are required.' }, { status: 400 });
    }

    const db = neon(process.env.DATABASE_URL);
    if (status === 'active') {
      if (process.env.WORKER_EXECUTION_ENABLED !== 'true' ||
          !process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32 ||
          !getAgencyModelRuntimeReadiness().configured) {
        return NextResponse.json(
          { error: 'Worker execution is not fully configured. This workflow remains paused.' },
          { status: 409 },
        );
      }
      const checks = await db`
        SELECT
          to_regprocedure('public.claim_automation_runs(text,integer,integer)') IS NOT NULL AS automation_claim,
          to_regprocedure('public.complete_automation_run(uuid,uuid,text,jsonb,text)') IS NOT NULL AS automation_complete,
          to_regprocedure('public.claim_agent_tasks(text,integer,integer)') IS NOT NULL AS agent_claim,
          to_regprocedure('public.complete_agent_task(uuid,uuid,text,jsonb,text)') IS NOT NULL AS agent_complete,
          to_regprocedure('public.materialize_scheduled_automation_run(uuid,timestamptz,timestamptz)') IS NOT NULL AS scheduler
      `;
      const ready = checks[0];
      if (!ready?.automation_claim || !ready?.automation_complete || !ready?.agent_claim ||
          !ready?.agent_complete || !ready?.scheduler) {
        return NextResponse.json({ error: 'Worker database migrations are incomplete. This workflow remains paused.' }, { status: 409 });
      }
      const current = await db`
        SELECT id,schedule_cron,timezone
        FROM public.automation_jobs
        WHERE id = ${id}::uuid AND status IN ('paused','draft','active')
        LIMIT 1
      `;
      if (!current[0]) return NextResponse.json({ error: 'Workflow not found or cannot be activated.' }, { status: 404 });
      const nextRunAt = nextCronOccurrence(
        String(current[0].schedule_cron),
        String(current[0].timezone),
        new Date(),
      );
      const rows = await db`
        UPDATE public.automation_jobs
        SET status = 'active',
            next_run_at = ${nextRunAt.toISOString()}::timestamptz,
            consecutive_failures = 0,
            updated_at = now()
        WHERE id = ${id}::uuid AND status IN ('paused','draft','active')
        RETURNING id,job_type,title,status,schedule_cron,timezone,next_run_at,last_run_at
      `;
      return rows[0]
        ? NextResponse.json({ job: rows[0], message: 'Workflow activated. It will run when its next scheduled time is due.' })
        : NextResponse.json({ error: 'Workflow could not be activated.' }, { status: 409 });
    }

    const rows = await db`
      UPDATE public.automation_jobs
      SET status = 'paused', next_run_at = NULL, updated_at = now()
      WHERE id = ${id}::uuid AND status IN ('active','paused','draft')
      RETURNING id,job_type,title,status,schedule_cron,timezone,next_run_at,last_run_at
    `;
    return rows[0]
      ? NextResponse.json({ job: rows[0], message: 'Workflow paused. No new scheduled runs will be created.' })
      : NextResponse.json({ error: 'Workflow not found or cannot be paused.' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Could not update workflow status.' }, { status: 400 });
  }
}

export async function POST(req: Request) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    const body = await req.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const jobType = typeof body.job_type === 'string' ? body.job_type.trim() : '';
    const cron = typeof body.schedule_cron === 'string' ? body.schedule_cron.trim() : '';
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'Africa/Lagos';

    if (!title || title.length > 140 || !ALLOWED_JOB_TYPES.has(jobType)) {
      return NextResponse.json(
        { error: 'Enter a title and choose a supported workflow type.' },
        { status: 400 }
      );
    }

    if (cron.length > 120 || !isValidCron(cron)) {
      return NextResponse.json(
        { error: 'Enter a valid five-field cron schedule with values inside their allowed ranges.' },
        { status: 400 }
      );
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    } catch {
      return NextResponse.json({ error: 'Invalid timezone.' }, { status: 400 });
    }

    const config =
      body.config && typeof body.config === 'object' && !Array.isArray(body.config)
        ? body.config
        : {};
    const configJson = JSON.stringify(config);
    if (configJson.length > 8000) {
      return NextResponse.json({ error: 'Workflow configuration is too large.' }, { status: 400 });
    }

    const db = neon(process.env.DATABASE_URL);
    const rows = await db`INSERT INTO public.automation_jobs
      (job_type,title,status,schedule_cron,timezone,config,next_run_at)
      VALUES (${jobType},${title},'paused',${cron},${timezone},${configJson}::jsonb,NULL)
      RETURNING id,job_type,title,status,schedule_cron,timezone,config,next_run_at,created_at`;

    return NextResponse.json(
      {
        job: rows[0],
        message: 'Workflow saved as paused. No background execution has been enabled.',
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: 'Could not save workflow.' }, { status: 400 });
  }
}
