import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ALLOWED_AGENTS = new Set([
  'orchestrator',
  'research',
  'seo',
  'sales',
  'development',
  'client_ops',
  'finance',
]);

// These actions must never enter the ordinary queue, regardless of which
// specialist agent receives them. Drafting is allowed; execution is not.
const APPROVAL_REQUIRED_ACTIONS =
  /(^|[^a-z])(send|dispatch|publish|deploy|payment|pay|purchase|spend|delete|destroy|production_change|campaign_launch|launch_campaign|refund|charge)([^a-z]|$)/i;

async function isOwner() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(
    email &&
      process.env.OWNER_EMAIL &&
      email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase(),
  );
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  if (!(await isOwner())) return jsonError('Unauthorized', 401);

  try {
    const db = neon(process.env.DATABASE_URL!);
    const tasks = await db`
      SELECT id, agent_key, task_type, title, instructions, input, output,
             status, priority, requires_approval, started_at, finished_at,
             error_message, created_at
      FROM public.agent_tasks
      ORDER BY created_at DESC
      LIMIT 100
    `;
    return NextResponse.json({ tasks });
  } catch {
    return jsonError('Unable to load tasks.', 500);
  }
}

export async function POST(request: Request) {
  if (!(await isOwner())) return jsonError('Unauthorized', 401);

  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonError('A valid task object is required.', 400);
    }

    const agentKey = typeof body.agent_key === 'string' ? body.agent_key : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const taskType =
      typeof body.task_type === 'string' ? body.task_type.trim() : 'general';
    const instructions =
      typeof body.instructions === 'string' ? body.instructions : '';

    if (!ALLOWED_AGENTS.has(agentKey) || !title) {
      return jsonError('A valid agent and task title are required.', 400);
    }
    if (title.length > 180 || taskType.length > 80 || instructions.length > 12000) {
      return jsonError('Task fields exceed the allowed length.', 400);
    }

    const rawPriority = Number(body.priority);
    const priority = Number.isFinite(rawPriority)
      ? Math.max(1, Math.min(100, Math.round(rawPriority)))
      : 50;

    const approvalRequired =
      body.requires_approval === true ||
      APPROVAL_REQUIRED_ACTIONS.test(taskType);

    const status = approvalRequired ? 'waiting_approval' : 'queued';
    const input =
      body.input && typeof body.input === 'object' && !Array.isArray(body.input)
        ? body.input
        : {};

    const db = neon(process.env.DATABASE_URL!);
    const rows = await db`
      INSERT INTO public.agent_tasks
        (agent_key, task_type, title, instructions, input, status, priority,
         requires_approval, requested_by)
      VALUES
        (${agentKey}, ${taskType || 'general'}, ${title}, ${instructions},
         ${JSON.stringify(input)}::jsonb, ${status}, ${priority},
         ${approvalRequired}, 'owner')
      RETURNING id, agent_key, task_type, title, status, priority,
                requires_approval, created_at
    `;

    await db`
      INSERT INTO public.agent_task_events (task_id, event_type, details)
      VALUES (
        ${rows[0].id},
        'task_created',
        ${JSON.stringify({
          source: 'owner_console',
          status,
          approvalRequired,
        })}::jsonb
      )
    `;

    return NextResponse.json(
      {
        task: rows[0],
        message: approvalRequired
          ? 'Task saved and is waiting for owner approval. No external action has been taken.'
          : 'Task queued. Execution remains disabled until a worker and required providers are configured.',
      },
      { status: 201 },
    );
  } catch {
    return jsonError('Unable to create task. Check the task details and try again.', 400);
  }
}
