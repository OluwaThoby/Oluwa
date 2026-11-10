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
  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  }

  const { id } = await context.params;
  if (!id || id.length > 80) {
    return NextResponse.json({ error: 'Invalid task ID.' }, { status: 400 });
  }

  try {
    const db = neon(process.env.DATABASE_URL);
    // Failed tasks can be retried. A running task is recoverable only after
    // ten minutes without an update, avoiding duplicate concurrent inference.
    // The state change and audit event commit as one statement.
    const rows = await db`
      WITH requeued AS (
        UPDATE public.agent_tasks
        SET status = 'queued', output = '{}'::jsonb,
            started_at = NULL, finished_at = NULL,
            error_message = NULL, updated_at = NOW()
        WHERE id = ${id}
          AND requires_approval = false
          AND (
            status = 'failed'
            OR (status = 'running' AND started_at < NOW() - INTERVAL '10 minutes')
          )
        RETURNING id, agent_key, title, status, priority
      ), logged AS (
        INSERT INTO public.agent_task_events (task_id, event_type, details)
        SELECT id, 'task_requeued',
          ${JSON.stringify({ source: 'owner_console', stale_running_threshold_minutes: 10 })}::jsonb
        FROM requeued
        RETURNING task_id
      )
      SELECT requeued.*
      FROM requeued JOIN logged ON logged.task_id = requeued.id
    `;

    const task = (rows as unknown as Array<{
      id: string; agent_key: string; title: string; status: string; priority: number;
    }>)[0];
    if (!task) {
      return NextResponse.json({
        error: 'This task is not failed or stale, or it requires approval. No change was made.',
      }, { status: 409 });
    }
    return NextResponse.json({
      task,
      message: 'Task returned to the queue. It will run only when explicitly started and a model runtime is configured.',
    });
  } catch {
    return NextResponse.json({ error: 'Unable to safely requeue this task.' }, { status: 500 });
  }
}
