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
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });

  const { id } = await context.params;
  if (!id || id.length > 80) return NextResponse.json({ error: 'Invalid task ID.' }, { status: 400 });

  try {
    const db = neon(process.env.DATABASE_URL);
    const rows = await db`
      WITH approved AS (
        UPDATE public.agent_tasks
        SET status = 'queued', requires_approval = false,
            error_message = NULL, finished_at = NULL, updated_at = NOW()
        WHERE id = ${id} AND status = 'waiting_approval' AND requires_approval = true
        RETURNING id, agent_key, title
      ), logged AS (
        INSERT INTO public.agent_task_events (task_id, event_type, details)
        SELECT id, 'draft_preparation_approved',
          jsonb_build_object('approved_by', 'owner', 'scope', 'draft_only', 'external_actions_enabled', false)
        FROM approved
        RETURNING task_id
      )
      SELECT approved.id FROM approved JOIN logged ON logged.task_id = approved.id
    `;
    if (!rows[0]) return NextResponse.json({ error: 'This task is no longer awaiting approval.' }, { status: 409 });
    return NextResponse.json({ taskId: id, status: 'queued', message: 'Draft preparation approved. External actions remain disabled.' });
  } catch {
    return NextResponse.json({ error: 'Could not approve draft preparation.' }, { status: 500 });
  }
}
