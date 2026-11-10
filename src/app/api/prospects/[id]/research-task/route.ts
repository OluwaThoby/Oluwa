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
    return NextResponse.json({ error: 'Invalid prospect ID.' }, { status: 400 });
  }

  try {
    const db = neon(process.env.DATABASE_URL);
    const rows = await db`
      SELECT id, business_name, website_url, business_email, phone, category,
             city, country, source, source_url, website_status,
             opportunity_score, research_summary
      FROM public.prospects
      WHERE id = ${id}
      LIMIT 1
    `;
    const prospect = rows[0];
    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found.' }, { status: 404 });
    }

    const taskInput = {
      prospect,
      evidence_scope: 'Only the supplied prospect record is available. No live web research, website crawl, SEO measurement, contact verification, or external lookup has been performed.',
    };
    const tasks = await db`
      INSERT INTO public.agent_tasks
        (agent_key, task_type, title, instructions, input, status, priority,
         requires_approval, requested_by)
      VALUES
        ('research', 'prospect_qualification',
         ${'Prepare qualification brief: ' + String(prospect.business_name).slice(0, 130)},
         ${'Create a concise prospect qualification brief using only the supplied record. Assess fit, identify missing evidence, list the most useful next research checks, and suggest a respectful first-contact angle only if supported. Separate confirmed facts from assumptions. Do not invent details, claim to have browsed or audited the website, verify contact information, or contact the business. Draft only.'},
         ${JSON.stringify(taskInput)}::jsonb, 'queued', 70, false, 'owner')
      RETURNING id, agent_key, title, status, created_at
    `;
    await db`
      INSERT INTO public.agent_task_events (task_id, event_type, details)
      VALUES (${tasks[0].id}, 'task_created', ${JSON.stringify({
        source: 'prospect_pipeline',
        prospectId: id,
        mode: 'record_only_draft',
      })}::jsonb)
    `;

    return NextResponse.json({
      task: tasks[0],
      message: 'A draft-only qualification task has been queued. No external research or contact has occurred.',
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to prepare the prospect brief.' }, { status: 500 });
  }
}
