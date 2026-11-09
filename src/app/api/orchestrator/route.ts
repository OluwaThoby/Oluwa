import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Keep the default aligned with an exact model ID in the AI Gateway catalog.
// Override through AI_GATEWAY_MODEL only after verifying the ID in /v1/models.
const MODEL = process.env.AI_GATEWAY_MODEL || 'deepseek/deepseek-v4-flash';

async function isOwner() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(email && email.toLowerCase() === process.env.OWNER_EMAIL?.toLowerCase());
}

export async function POST(request: Request) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
    if (!goal || goal.length > 4000) {
      return NextResponse.json({ error: 'Provide a goal between 1 and 4,000 characters.' }, { status: 400 });
    }

    const db = neon(process.env.DATABASE_URL!);
    const [task] = await db`
      INSERT INTO public.agent_tasks
        (agent_key, task_type, title, instructions, input, status, priority, requires_approval, requested_by, started_at)
      VALUES
        ('orchestrator', 'strategic_plan', 'Agency operating plan', ${goal},
         ${JSON.stringify({ goal })}::jsonb, 'running', 80, false, 'owner', NOW())
      RETURNING id
    `;

    try {
      const result = await generateText({
        model: MODEL,
        system: `You are the Chief of Staff and operating strategist for a small, owner-operated digital agency called AgencyOS.
Your job is to turn the owner's goal into a practical, revenue-aware execution plan.
Prioritise website design and development as the core offer, then recurring website maintenance and SEO.
The agency serves Nigeria and international clients. Be commercially realistic for a lean solo operator.
Never claim an action has been performed when it has only been recommended.
Never send outreach, spend money, make commitments, change production systems, or deploy anything.
Those actions always require explicit owner approval.
Return a concise but useful plan with: objective, why it matters, ordered next actions, dependencies, risks, approval gates, and a measurable definition of done.
If critical information is missing, state the assumption and continue with a sensible default.`,
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
            finished_at = NOW(), updated_at = NOW()
        WHERE id = ${task.id}
      `;
      await db`
        INSERT INTO public.agent_task_events (task_id, event_type, details)
        VALUES (${task.id}, 'plan_generated', ${JSON.stringify({ model: MODEL })}::jsonb)
      `;

      return NextResponse.json({ taskId: task.id, ...output });
    } catch (error) {
      await db`
        UPDATE public.agent_tasks
        SET status = 'failed', error = ${error instanceof Error ? error.message.slice(0, 1000) : 'AI request failed'},
            finished_at = NOW(), updated_at = NOW()
        WHERE id = ${task.id}
      `;
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate an operating plan.';
    const status = /AI_GATEWAY|token|authentication|credit|budget/i.test(message) ? 503 : 500;
    return NextResponse.json({
      error: status === 503
        ? 'The AI engine is not ready yet. Check Vercel AI Gateway access and model configuration.'
        : 'The orchestrator could not complete this task.',
    }, { status });
  }
}
