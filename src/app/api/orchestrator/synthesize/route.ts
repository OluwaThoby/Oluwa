import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function isOwner() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(email && process.env.OWNER_EMAIL &&
    email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase());
}

export async function POST(request: Request) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });

  try {
    const body = await request.json();
    const parentId = typeof body?.parent_task_id === 'string' ? body.parent_task_id : '';
    if (!/^[0-9a-f-]{36}$/i.test(parentId)) {
      return NextResponse.json({ error: 'A valid Chief of Staff task ID is required.' }, { status: 400 });
    }

    const db = neon(process.env.DATABASE_URL);
    const rows = await db`
      WITH lock_key AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtext(${parentId}))
      ), parent AS MATERIALIZED (
        SELECT id, title, output
        FROM public.agent_tasks
        WHERE id = ${parentId} AND agent_key = 'orchestrator' AND status = 'succeeded'
      ), team AS MATERIALIZED (
        SELECT id, agent_key, title, status,
               LEFT(COALESCE(output->>'deliverable', output::text), 5000) AS deliverable
        FROM public.agent_tasks
        WHERE input->>'parent_task_id' = ${parentId}
      ), summary AS (
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status = 'succeeded')::int AS completed,
               COALESCE(jsonb_agg(jsonb_build_object(
                 'task_id', id, 'agent_key', agent_key, 'title', title,
                 'deliverable', deliverable
               ) ORDER BY agent_key) FILTER (WHERE status = 'succeeded'), '[]'::jsonb) AS deliverables
        FROM team
      ), inserted AS (
        INSERT INTO public.agent_tasks
          (agent_key, task_type, title, instructions, input, status, priority,
           requires_approval, requested_by)
        SELECT 'orchestrator', 'team_synthesis',
          'Synthesize specialist work: ' || LEFT(p.title, 110),
          'Combine the completed specialist deliverables into one coherent agency execution brief. Identify agreements, conflicts, gaps, dependencies, recommended order and measurable next actions. Distinguish evidence from assumptions. Do not invent missing facts or claim external actions occurred.',
          jsonb_build_object(
            'parent_task_id', p.id,
            'synthesis_for_parent', p.id,
            'team_deliverables', s.deliverables
          ),
          'queued', 95, false, 'orchestrator'
        FROM parent p CROSS JOIN summary s CROSS JOIN lock_key
        WHERE s.total > 0 AND s.total = s.completed
          AND NOT EXISTS (
            SELECT 1 FROM public.agent_tasks existing
            WHERE existing.input->>'synthesis_for_parent' = p.id::text
              AND existing.task_type = 'team_synthesis'
              AND existing.status <> 'failed'
          )
        RETURNING id, title, status, input
      ), logged AS (
        INSERT INTO public.agent_task_events (task_id, event_type, details)
        SELECT id, 'team_synthesis_queued',
          jsonb_build_object('parent_task_id', ${parentId}, 'specialist_count', jsonb_array_length(input->'team_deliverables'))
        FROM inserted
        RETURNING task_id
      )
      SELECT i.id, i.title, i.status, i.input
      FROM inserted i JOIN logged l ON l.task_id = i.id
    `;

    if (!rows.length) {
      const state = await db`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status = 'succeeded')::int AS completed
        FROM public.agent_tasks
        WHERE input->>'parent_task_id' = ${parentId}
      `;
      const total = Number(state[0]?.total ?? 0);
      const completed = Number(state[0]?.completed ?? 0);
      if (total > 0 && total === completed) {
        return NextResponse.json({ error: 'A synthesis task already exists for this delegation.' }, { status: 409 });
      }
      return NextResponse.json({
        error: total === 0
          ? 'No specialist tasks were found for this plan.'
          : `Team synthesis is locked until every specialist task succeeds (${completed}/${total} completed).`,
      }, { status: 409 });
    }

    return NextResponse.json({ task: rows[0], message: 'Team synthesis task queued. It will combine the completed specialist deliverables when the model runtime is available.' }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to queue team synthesis safely.' }, { status: 500 });
  }
}
