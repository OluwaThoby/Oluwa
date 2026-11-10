import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// AI SDK routes provider/model strings through Vercel AI Gateway.
// Configure AI_GATEWAY_API_KEY or Vercel OIDC before invoking this endpoint.
const MODEL = process.env.AI_GATEWAY_MODEL || 'deepseek/deepseek-v4-flash';

async function isOwner() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(
    email &&
      process.env.OWNER_EMAIL &&
      email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase(),
  );
}

export async function POST(request: Request) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let taskId: string | undefined;
  let db: ReturnType<typeof neon> | undefined;

  try {
    const body = await request.json();
    const goal = typeof body?.goal === 'string' ? body.goal.trim() : '';
    if (!goal || goal.length > 4000) {
      return NextResponse.json(
        { error: 'Provide a goal between 1 and 4,000 characters.' },
        { status: 400 },
      );
    }

    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
    }

    db = neon(process.env.DATABASE_URL);
    const [task] = await db`
      INSERT INTO public.agent_tasks
        (agent_key, task_type, title, instructions, input, status, priority,
         requires_approval, requested_by, started_at)
      VALUES
        ('orchestrator', 'strategic_plan', 'Agency operating plan', ${goal},
         ${JSON.stringify({ goal })}::jsonb, 'running', 80, false, 'owner', NOW())
      RETURNING id
    `;
    taskId = task.id;

    const result = await generateText({
      model: MODEL,
      system: `You are the Chief of Staff for AgencyOS, a small owner-operated digital agency.
Create a practical, revenue-aware execution plan. Prioritise website design and development as the core offer, followed by recurring maintenance and SEO.
The agency serves Nigeria and international clients. Be commercially realistic for a lean solo operator.
Separate verified facts, assumptions and recommendations. Never invent prospects, research, audit results, revenue or completed actions.
Never send outreach, spend money, make commitments, modify production systems or deploy anything. Those actions require explicit owner approval.
Return a clear plan with: objective, current assumptions, ordered actions, expected deliverables, dependencies, risks, approval gates and measurable definition of done.
Prefer the smallest useful next action over a vague long-term roadmap.`,
      prompt: goal,
    });

    const output = {
      plan: result.text,
      model: MODEL,
      generatedAt: new Date().toISOString(),
      usage: result.usage ?? null,
    };

    await db`
      UPDATE public.agent_tasks
      SET status = 'succeeded', output = ${JSON.stringify(output)}::jsonb,
          finished_at = NOW(), updated_at = NOW(), error_message = NULL
      WHERE id = ${taskId}
    `;
    await db`
      INSERT INTO public.agent_task_events (task_id, event_type, details)
      VALUES (${taskId}, 'plan_generated', ${JSON.stringify({ model: MODEL })}::jsonb)
    `;

    return NextResponse.json({ taskId, ...output });
  } catch (error) {
    const safeMessage =
      error instanceof Error ? error.message.slice(0, 1000) : 'Unknown orchestrator error';

    if (db && taskId) {
      try {
        // Keep failure recording aligned with the actual Neon schema.
        await db`
          UPDATE public.agent_tasks
          SET status = 'failed', error_message = ${safeMessage},
              finished_at = NOW(), updated_at = NOW()
          WHERE id = ${taskId}
        `;
        await db`
          INSERT INTO public.agent_task_events (task_id, event_type, details)
          VALUES (
            ${taskId},
            'execution_failed',
            ${JSON.stringify({ reason: safeMessage.slice(0, 300) })}::jsonb
          )
        `;
      } catch {
        // Preserve the original error response if failure logging also fails.
      }
    }

    const message = error instanceof Error ? error.message : '';
    const status = /gateway|token|authentication|credit|budget|api key|unauthorized/i.test(message)
      ? 503
      : 500;
    return NextResponse.json(
      {
        error:
          status === 503
            ? 'The AI engine is not ready. Verify AI Gateway credentials and model access.'
            : 'The orchestrator could not complete this task. The failure has been recorded when the database was available.',
      },
      { status },
    );
  }
}
