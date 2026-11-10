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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });

  const { id: projectId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId || '')) {
    return NextResponse.json({ error: 'Invalid project ID.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    if (body?.confirmed !== true) {
      return NextResponse.json({ error: 'Explicit confirmation is required before creating project tasks.' }, { status: 400 });
    }
    const sourceTaskId = typeof body.agent_task_id === 'string' ? body.agent_task_id : '';
    if (!/^[0-9a-f-]{36}$/i.test(sourceTaskId)) {
      return NextResponse.json({ error: 'A valid completed agent task ID is required.' }, { status: 400 });
    }
    if (!Array.isArray(body.tasks) || body.tasks.length < 1 || body.tasks.length > 20) {
      return NextResponse.json({ error: 'Select between 1 and 20 tasks to add.' }, { status: 400 });
    }

    const tasks = body.tasks.map((item: unknown) => {
      const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const title = typeof value.title === 'string' ? value.title.trim() : '';
      const description = typeof value.description === 'string' ? value.description.trim() : '';
      const priority = ['low', 'normal', 'high', 'urgent'].includes(String(value.priority)) ? String(value.priority) : 'normal';
      const dueAt = value.due_at === null || value.due_at === '' || value.due_at === undefined
        ? null : typeof value.due_at === 'string' ? value.due_at : 'invalid';
      if (title.length < 2 || title.length > 180 || description.length > 3000 ||
          (dueAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueAt))) {
        throw new Error('Each task needs a title (2–180 characters), a description under 3,000 characters and a valid optional due date.');
      }
      return { title, description, priority, due_at: dueAt };
    });

    const db = neon(process.env.DATABASE_URL);
    const rows = await db`
      WITH source AS MATERIALIZED (
        SELECT id, title
        FROM public.agent_tasks
        WHERE id = ${sourceTaskId}
          AND status = 'succeeded'
          AND output <> '{}'::jsonb
      ), target AS MATERIALIZED (
        SELECT id FROM public.projects WHERE id = ${projectId}
      ), submitted AS MATERIALIZED (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(tasks)}::jsonb)
          AS x(title text, description text, priority text, due_at text)
      ), inserted AS (
        INSERT INTO public.project_tasks
          (project_id, title, description, priority, due_at, source_agent_task_id)
        SELECT target.id, submitted.title, submitted.description, submitted.priority,
               CASE WHEN submitted.due_at IS NULL THEN NULL ELSE submitted.due_at::date END,
               source.id
        FROM source CROSS JOIN target CROSS JOIN submitted
        ON CONFLICT (project_id, source_agent_task_id)
          WHERE source_agent_task_id IS NOT NULL
        DO NOTHING
        RETURNING id, project_id, title, description, priority, due_at
      ), logged AS (
        INSERT INTO public.activity_log
          (department, event_type, summary, entity_type, entity_id, metadata)
        SELECT 'delivery', 'agent_tasks_imported',
          'Added AI-prepared task: ' || LEFT(inserted.title, 140),
          'project', inserted.project_id,
          jsonb_build_object('project_task_id', inserted.id, 'source_agent_task_id', ${sourceTaskId})
        FROM inserted
        RETURNING entity_id
      )
      SELECT inserted.* FROM inserted
      WHERE EXISTS (SELECT 1 FROM logged WHERE logged.entity_id = inserted.project_id)
    `;

    if (!rows.length) {
      const valid = await db`
        SELECT EXISTS(SELECT 1 FROM public.agent_tasks WHERE id = ${sourceTaskId} AND status = 'succeeded') AS source_ok,
               EXISTS(SELECT 1 FROM public.projects WHERE id = ${projectId}) AS project_ok
      `;
      if (!valid[0]?.source_ok) return NextResponse.json({ error: 'Only completed agent deliverables can become project tasks.' }, { status: 409 });
      if (!valid[0]?.project_ok) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
      return NextResponse.json({ tasks: [], created: 0, message: 'These suggestions have already been imported for this project.' });
    }

    return NextResponse.json({
      tasks: rows,
      created: rows.length,
      message: `${rows.length} approved task(s) added to the project. No external action was taken.`,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Each task needs')) return NextResponse.json({ error: message }, { status: 400 });
    return NextResponse.json({ error: 'Could not add the selected tasks to this project.' }, { status: 500 });
  }
}
