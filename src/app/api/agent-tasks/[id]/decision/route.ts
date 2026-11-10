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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) {
    return NextResponse.json({ error: 'Invalid task ID.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const decision = body?.decision;
    if (decision !== 'approve_draft' && decision !== 'reject') {
      return NextResponse.json({ error: 'Choose approve_draft or reject.' }, { status: 400 });
    }

    const db = neon(process.env.DATABASE_URL);
    const status = decision === 'approve_draft' ? 'queued' : 'cancelled';
    const rows = await db`
      WITH changed AS (
        UPDATE public.agent_tasks
        SET status = ${status},
            requires_approval = CASE WHEN ${decision} = 'approve_draft' THEN false ELSE true END,
            input = COALESCE(input, '{}'::jsonb) || jsonb_build_object(
              'owner_decision', ${decision},
              'owner_decided_at', NOW(),
              'approved_scope', CASE WHEN ${decision} = 'approve_draft'
                THEN 'draft_generation_only_no_external_actions' ELSE 'rejected' END
            ),
            updated_at = NOW(),
            finished_at = CASE WHEN ${decision} = 'reject' THEN NOW() ELSE NULL END
        WHERE id = ${id}
          AND status = 'waiting_approval'
          AND requires_approval = true
        RETURNING id, agent_key, title, status
      ), logged AS (
        INSERT INTO public.agent_task_events (task_id, event_type, details)
        SELECT id,
          CASE WHEN ${decision} = 'approve_draft' THEN 'owner_approved_draft_execution' ELSE 'owner_rejected_task' END,
          jsonb_build_object(
            'decision', ${decision},
            'scope', 'draft_generation_only_no_external_actions',
            'decided_at', NOW()
          )
        FROM changed
        RETURNING task_id
      )
      SELECT changed.* FROM changed JOIN logged ON logged.task_id = changed.id
    `;

    if (!rows.length) {
      return NextResponse.json({
        error: 'This task is no longer waiting for approval. Refresh the task list before deciding.',
      }, { status: 409 });
    }

    return NextResponse.json({
      task: rows[0],
      message: decision === 'approve_draft'
        ? 'Approved for draft generation only. This does not authorise sending, spending, publishing, deployment or other external actions.'
        : 'Task rejected and cancelled. No action was executed.',
    });
  } catch {
    return NextResponse.json({ error: 'Unable to record the task decision safely.' }, { status: 500 });
  }
}
