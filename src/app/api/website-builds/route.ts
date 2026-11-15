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

const complexityLevels = new Set(['starter', 'business', 'commerce', 'custom_app']);

export async function GET() {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });

  try {
    const db = neon(process.env.DATABASE_URL);
    const builds = await db`
      SELECT b.id, b.project_id, b.build_number, b.complexity, b.status,
             b.brief, b.preview_url, b.production_url, b.approval_required,
             b.created_at, b.updated_at, p.name AS project_name,
             c.business_name AS client_name
      FROM public.website_builds b
      JOIN public.projects p ON p.id = b.project_id
      LEFT JOIN public.clients c ON c.id = p.client_id
      ORDER BY b.updated_at DESC
      LIMIT 200
    `;
    return NextResponse.json({ builds });
  } catch {
    return NextResponse.json({
      error: 'Website delivery storage is not ready. Apply the website-delivery database migration on this environment first.',
    }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });

  try {
    const body = await request.json();
    const projectId = typeof body?.project_id === 'string' ? body.project_id : '';
    const complexity = typeof body?.complexity === 'string' ? body.complexity : '';
    const projectBrief = body?.brief && typeof body.brief === 'object' && !Array.isArray(body.brief)
      ? body.brief : {};

    if (!projectId) return NextResponse.json({ error: 'Choose an existing project.' }, { status: 400 });
    if (!complexityLevels.has(complexity)) {
      return NextResponse.json({ error: 'Choose starter, business, commerce or custom_app complexity.' }, { status: 400 });
    }

    const briefText = JSON.stringify(projectBrief);
    if (briefText.length > 20000) return NextResponse.json({ error: 'The website brief is too large.' }, { status: 400 });

    const db = neon(process.env.DATABASE_URL);
    const projects = await db`
      SELECT id, name, service_type, status, brief
      FROM public.projects
      WHERE id = ${projectId}
      LIMIT 1
    `;
    if (!projects[0]) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

    const rows = await db`
      INSERT INTO public.website_builds
        (project_id, build_number, complexity, status, brief, generation_plan, approval_required)
      SELECT
        p.id,
        COALESCE((SELECT MAX(existing.build_number) + 1
          FROM public.website_builds existing WHERE existing.project_id = p.id), 1),
        ${complexity},
        'requirements_review',
        ${JSON.stringify({ ...projectBrief, source_project_brief: projects[0].brief })}::jsonb,
        '${JSON.stringify({ phase: 'not_started', note: 'Chief AI planning and actual code generation are not yet run.' })}'::jsonb,
        true
      FROM public.projects p
      WHERE p.id = ${projectId}
      RETURNING id, project_id, build_number, complexity, status, brief, approval_required, created_at
    `;
    if (!rows[0]) return NextResponse.json({ error: 'Could not create website build record.' }, { status: 500 });

    await db`
      INSERT INTO public.activity_log
        (department, event_type, summary, entity_type, entity_id, metadata)
      VALUES
        ('delivery', 'website_build_intake_created',
         ${'Website build intake created for ' + projects[0].name},
         'project', ${projectId}::uuid,
         ${JSON.stringify({ website_build_id: rows[0].id, complexity, status: 'requirements_review' })}::jsonb)
    `;

    return NextResponse.json({
      build: rows[0],
      message: 'Website build intake created. Requirements review and Chief AI planning are the next steps; no website code has been generated or deployed.',
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Could not create website build intake. Check that the website-delivery migration is applied.' }, { status: 503 });
  }
}
