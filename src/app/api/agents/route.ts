import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function authorised() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(
    email &&
      process.env.OWNER_EMAIL &&
      email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase(),
  );
}

export async function GET() {
  if (!(await authorised())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  }

  try {
    const db = neon(process.env.DATABASE_URL);
    const agents = await db`
      SELECT
        a.agent_key,
        a.display_name,
        a.role,
        a.description,
        a.status,
        a.capabilities,
        a.requires_approval_for,
        COUNT(t.id)::int AS task_count,
        COUNT(t.id) FILTER (
          WHERE t.status IN ('queued', 'running', 'waiting_approval')
        )::int AS open_tasks,
        COUNT(t.id) FILTER (WHERE t.status = 'succeeded')::int AS completed_tasks,
        COUNT(t.id) FILTER (WHERE t.status = 'failed')::int AS failed_tasks
      FROM public.agency_agents a
      LEFT JOIN public.agent_tasks t ON t.agent_key = a.agent_key
      GROUP BY a.id
      ORDER BY
        CASE a.agent_key WHEN 'orchestrator' THEN 0 ELSE 1 END,
        a.display_name
    `;
    return NextResponse.json({ agents });
  } catch {
    return NextResponse.json(
      { error: 'Unable to load agent status. Please retry.' },
      { status: 500 },
    );
  }
}
