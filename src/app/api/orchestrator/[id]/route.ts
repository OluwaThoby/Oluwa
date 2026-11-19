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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'A valid parent task ID is required.' }, { status: 400 });
  }

  try {
    const db = neon(process.env.DATABASE_URL);
    const parents = await db`
      SELECT id, agent_key, task_type, title, status, priority, output,
             created_at, started_at, finished_at
      FROM public.agent_tasks
      WHERE id = ${id}::uuid
      LIMIT 1
    `;
    if (!parents[0]) {
      return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    }

    const children = await db`
      SELECT id, agent_key, task_type, title, status, priority,
             requires_approval, output, error_message,
             created_at, started_at, finished_at
      FROM public.agent_tasks
      WHERE input->>'parent_task_id' = ${id}
      ORDER BY priority DESC, created_at ASC
      LIMIT 50
    `;

    const childIds = children.map((task) => task.id);
    const events = childIds.length
      ? await db`
          SELECT task_id, event_type, details, created_at
          FROM public.agent_task_events
          WHERE task_id = ANY(${childIds}::uuid[])
          ORDER BY created_at ASC
          LIMIT 200
        `
      : [];

    const counts = children.reduce((result, task) => {
      const status = String(task.status || 'unknown');
      result[status] = (result[status] || 0) + 1;
      return result;
    }, {} as Record<string, number>);

    return NextResponse.json({
      parent: parents[0],
      children,
      events,
      summary: {
        total: children.length,
        byStatus: counts,
        requiresOwnerAttention: children.filter((task) =>
          task.status === 'waiting_approval' || task.status === 'failed'
        ).length,
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Unable to load the task coordination record.' },
      { status: 500 },
    );
  }
}
