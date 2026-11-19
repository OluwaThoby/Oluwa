import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function ownerAllowed() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(email && process.env.OWNER_EMAIL &&
    email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase());
}

export async function GET() {
  if (!(await ownerAllowed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  try {
    const db = neon(process.env.DATABASE_URL);
    const [plans, profile] = await Promise.all([
      db`SELECT id, title, instructions, input, output, status, created_at, finished_at
          FROM public.agent_tasks
          WHERE agent_key = 'orchestrator' AND task_type IN ('strategic_plan','chief_ai_plan')
            AND status = 'succeeded' AND output ? 'plan'
          ORDER BY created_at DESC LIMIT 50`,
      db`SELECT version FROM public.agency_business_profile
          WHERE owner_email = ${process.env.OWNER_EMAIL} LIMIT 1`,
    ]);
    return NextResponse.json({
      plans: (plans as any[]).map(row => {
        const rawPlan = row.output?.plan;
        const planText = typeof rawPlan === 'string' ? rawPlan : rawPlan && typeof rawPlan === 'object'
          ? [
              '## Objective', rawPlan.objective || row.title || 'Agency operating plan',
              '## Summary', rawPlan.summary || 'No summary was provided.',
              '## Ordered actions', ...(Array.isArray(rawPlan.ordered_actions) ? rawPlan.ordered_actions.map((item: string, index: number) => (index + 1) + '. ' + item) : []),
              '## Assumptions to confirm', ...(Array.isArray(rawPlan.assumptions) ? rawPlan.assumptions.map((item: string) => '• ' + item) : []),
              '## Risks to manage', ...(Array.isArray(rawPlan.risks) ? rawPlan.risks.map((item: string) => '• ' + item) : []),
            ].join('\n\n') : '';
        return {
          ...row,
          output: { ...(row.output || {}), plan: planText },
          planStatus: ['draft','under_review','approved','archived'].includes(row.output?.planStatus)
            ? row.output.planStatus : 'draft',
        };
      }),
      currentProfileVersion: (profile as any[])[0]?.version ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Unable to load operating plans.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await ownerAllowed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  try {
    const body = await request.json();
    const id = typeof body?.id === 'string' ? body.id : '';
    const status = typeof body?.status === 'string' ? body.status : '';
    if (!/^[0-9a-f-]{36}$/i.test(id) || !['draft','under_review','approved','archived'].includes(status)) {
      return NextResponse.json({ error: 'A valid plan and status are required.' }, { status: 400 });
    }
    const db = neon(process.env.DATABASE_URL);
    const changed = await db`
      WITH updated AS (
        UPDATE public.agent_tasks
        SET output = jsonb_set(COALESCE(output, '{}'::jsonb), '{planStatus}', to_jsonb(${status}::text), true),
            updated_at = NOW()
        WHERE id = ${id} AND agent_key = 'orchestrator'
          AND task_type IN ('strategic_plan','chief_ai_plan') AND status = 'succeeded'
          AND (${status} <> 'approved' OR (
            (SELECT version FROM public.agency_business_profile
              WHERE owner_email = ${process.env.OWNER_EMAIL} LIMIT 1) IS NOT NULL
            AND (output->>'businessProfileVersion') IS NOT DISTINCT FROM (
              SELECT version::text FROM public.agency_business_profile
              WHERE owner_email = ${process.env.OWNER_EMAIL} LIMIT 1
            )))
        RETURNING id, title, output
      ), logged AS (
        INSERT INTO public.agent_task_events (task_id, event_type, details)
        SELECT id, 'operating_plan_status_changed',
          jsonb_build_object('status', ${status}::text, 'source', 'owner_plan_manager')
        FROM updated RETURNING task_id
      )
      SELECT updated.id, updated.output FROM updated JOIN logged ON logged.task_id = updated.id
    `;
    if (!(changed as any[])[0]) return NextResponse.json({ error: status === 'approved' ? 'This plan uses an outdated business profile. Update your profile and create a fresh plan before approving it.' : 'Plan not found or not eligible for review.' }, { status: status === 'approved' ? 409 : 404 });
    return NextResponse.json({ message: 'Plan status updated.', plan: changed[0] });
  } catch {
    return NextResponse.json({ error: 'Unable to update plan status.' }, { status: 500 });
  }
}
