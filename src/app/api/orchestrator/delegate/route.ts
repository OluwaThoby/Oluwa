import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const AGENTS = new Set([
  'research', 'seo', 'sales', 'development', 'client_ops', 'finance',
]);
const SENSITIVE =
  /\b(send|publish|deploy|payment|pay|purchase|buy|spend|delete|destroy|refund|charge|transfer|withdraw|issue_invoice|create_invoice|change_dns|modify_live|contact_prospect|email_customer)\b/i;

async function isOwner() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(email && process.env.OWNER_EMAIL &&
    email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase());
}

export async function POST(request: Request) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const parentId = typeof body?.parent_task_id === 'string' ? body.parent_task_id : '';
    const rawTasks = Array.isArray(body?.tasks) ? body.tasks : [];
    if (!/^[0-9a-f-]{36}$/i.test(parentId) || rawTasks.length < 1 || rawTasks.length > 6) {
      return NextResponse.json({
        error: 'Provide a valid completed parent task and between 1 and 6 specialist tasks.',
      }, { status: 400 });
    }

    const tasks = rawTasks.map((item: unknown) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const agent = typeof row.agent_key === 'string' ? row.agent_key : '';
      const title = typeof row.title === 'string' ? row.title.trim() : '';
      const instructions = typeof row.instructions === 'string' ? row.instructions.trim() : '';
      const taskType = typeof row.task_type === 'string' ? row.task_type.trim() : 'delegated_work';
      const priority = Number.isFinite(Number(row.priority))
        ? Math.max(1, Math.min(100, Math.round(Number(row.priority)))) : 50;
      if (!AGENTS.has(agent) || !title || title.length > 180 ||
          instructions.length > 8000 || taskType.length > 80) {
        throw new Error('Each delegated task needs a valid specialist, title and bounded instructions.');
      }
      const requiresApproval = SENSITIVE.test([title, instructions, taskType].join(' '));
      return {
        agent_key: agent, title, instructions, task_type: taskType,
        priority, requires_approval: requiresApproval,
        status: requiresApproval ? 'waiting_approval' : 'queued',
        input: { delegated_from: parentId, delegation_version: 1 },
      };
    });

    const db = neon(process.env.DATABASE_URL);
    const rows = await db`
      WITH parent AS (
        SELECT id, output FROM public.agent_tasks
        WHERE id = ${parentId} AND status = 'succeeded'
        LIMIT 1
      ), requested AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(tasks)}::jsonb) AS x(
          agent_key text, title text, instructions text, task_type text,
          priority integer, requires_approval boolean, status text, input jsonb
        )
      ), inserted AS (
        INSERT INTO public.agent_tasks
          (agent_key, task_type, title, instructions, input, status, priority,
           requires_approval, requested_by)
        SELECT r.agent_key, r.task_type, r.title, r.instructions,
          r.input || jsonb_build_object('parent_task_id', p.id, 'parent_deliverable', p.output),
          r.status, r.priority, r.requires_approval, 'orchestrator'
        FROM requested r CROSS JOIN parent p
        RETURNING id, agent_key, title, status, priority, requires_approval
      ), logged AS (
        INSERT INTO public.agent_task_events (task_id, event_type, details)
        SELECT id, 'task_delegated',
          jsonb_build_object('parent_task_id', ${parentId}, 'source', 'orchestrator')
        FROM inserted
        RETURNING task_id
      )
      SELECT i.* FROM inserted i JOIN logged l ON l.task_id = i.id
    `;

    if (!rows.length) {
      return NextResponse.json({
        error: 'The parent task must exist and be successfully completed before delegation.',
      }, { status: 409 });
    }
    return NextResponse.json({
      delegated: rows,
      count: rows.length,
      message: 'Specialist tasks created. Queued tasks remain draft-only; sensitive tasks are held for owner approval.',
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return NextResponse.json({
      error: message.startsWith('Each delegated task')
        ? message : 'Unable to create specialist tasks safely.',
    }, { status: 400 });
  }
}
