import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { generateAgencyText } from '@/lib/intelligence/model-runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function isOwner() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(email && process.env.OWNER_EMAIL &&
    email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase());
}

function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not return a JSON website package.');
  return JSON.parse(candidate.slice(start, end + 1));
}

function validateFiles(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Generated website package is not an object.');
  }
  const raw = value as Record<string, unknown>;
  const allowed = new Set(['index.html', 'styles.css', 'script.js']);
  const files: Record<string, string> = {};
  for (const [name, content] of Object.entries(raw)) {
    if (!allowed.has(name) || typeof content !== 'string' || content.length > 30000) {
      throw new Error('Generated files must be limited to index.html, styles.css and script.js, each under 30 KB.');
    }
    files[name] = content;
  }
  if (!files['index.html'] || !files['styles.css']) {
    throw new Error('The generated package must include index.html and styles.css.');
  }
  const html = files['index.html'].toLowerCase();
  const combined = Object.values(files).join('\n').toLowerCase();
  const blockers = [
    /<script[^>]+src\s*=\s*["']https?:/i.test(files['index.html']),
    /<iframe\b/i.test(files['index.html']),
    /javascript:/i.test(combined),
    /document\.cookie|localstorage|sessionstorage/i.test(combined),
  ];
  if (blockers.some(Boolean)) {
    throw new Error('Generated source contains a disallowed remote script, iframe, executable URL or browser storage access.');
  }
  const warnings: string[] = [];
  if (!/<meta[^>]+name=["']viewport["']/i.test(files['index.html'])) warnings.push('Missing responsive viewport metadata.');
  if (!/<title>/i.test(files['index.html'])) warnings.push('Missing document title.');
  if (!/<main\b/i.test(files['index.html'])) warnings.push('No main landmark found.');
  if (!/<h1\b/i.test(files['index.html'])) warnings.push('No primary page heading found.');
  if (/lorem ipsum|your company|example\.com|replace me|placeholder/i.test(combined)) {
    warnings.push('Possible placeholder copy remains; review before showing a customer.');
  }
  return { files, warnings };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid website build ID.' }, { status: 400 });
  }
  try {
    const db = neon(process.env.DATABASE_URL);
    const rows = await db`
      SELECT id, status, generated_files, qa_report, model_used, generated_at
      FROM public.website_builds WHERE id = ${id} LIMIT 1
    `;
    if (!rows[0]) return NextResponse.json({ error: 'Website build not found.' }, { status: 404 });
    if (!rows[0].generated_at || !rows[0].generated_files || Object.keys(rows[0].generated_files as object).length === 0) {
      return NextResponse.json({ error: 'No generated source is available yet.' }, { status: 404 });
    }
    return NextResponse.json({ build: rows[0] });
  } catch {
    return NextResponse.json({ error: 'Unable to load the private website source.' }, { status: 503 });
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });

  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid website build ID.' }, { status: 400 });
  }

  try {
    const db = neon(process.env.DATABASE_URL);
    const rows = await db`
      SELECT b.id, b.complexity, b.brief, b.status, p.name AS project_name,
             p.service_type, p.brief AS project_brief, c.business_name AS client_name
      FROM public.website_builds b
      JOIN public.projects p ON p.id = b.project_id
      LEFT JOIN public.clients c ON c.id = p.client_id
      WHERE b.id = ${id}
      LIMIT 1
    `;
    const build = rows[0] as Record<string, unknown> | undefined;
    if (!build) return NextResponse.json({ error: 'Website build not found.' }, { status: 404 });
    if (['approved', 'deploying', 'live', 'cancelled'].includes(String(build.status))) {
      return NextResponse.json({ error: 'This build is locked from regeneration in its current state.' }, { status: 409 });
    }

    const brief = {
      project: build.project_name,
      client: build.client_name || 'Not supplied',
      service: build.service_type || 'Not specified',
      complexity: build.complexity,
      customer_requirements: build.brief,
      existing_project_brief: build.project_brief,
    };

    const result = await generateAgencyText({
      taskType: 'website_generation',
      maxOutputTokens: 4000,
      system: [
        'You are the senior website engineering specialist working under AgencyOS Chief AI.',
        'Create a complete, polished, responsive, production-minded static website starter as source code.',
        'Return ONLY a JSON object with exactly these string keys: index.html, styles.css, script.js.',
        'The HTML must reference ./styles.css and ./script.js. Include semantic landmarks, accessible labels, mobile navigation if useful, metadata, and real useful content based only on supplied facts.',
        'Never invent client testimonials, certifications, addresses, phone numbers, prices, statistics or awards. If details are absent, use clear neutral copy without fake specifics.',
        'Do not include external scripts, iframes, remote fonts, trackers, analytics, browser storage, payment processing, credential collection or hidden network calls.',
        'Do not use placeholder company names, lorem ipsum, or fake contact details. Make all interactive controls functional within the static page or visibly mark unavailable integrations as not connected.',
        'Keep source compact. Use no build tools or external dependencies. Do not include markdown fences.',
      ].join('\n'),
      prompt: 'Build the website from this verified project brief:\n' + JSON.stringify(brief),
    });

    const parsed = extractJson(result.text);
    const checked = validateFiles(parsed);
    const qa = {
      status: checked.warnings.length ? 'review_required' : 'passed_basic_checks',
      checks: {
        allowedFilesOnly: true,
        requiredFilesPresent: true,
        sourceSizeWithinLimits: true,
        noRemoteScriptsIframesOrBrowserStorage: true,
        responsiveViewport: !checked.warnings.includes('Missing responsive viewport metadata.'),
        semanticMain: !checked.warnings.includes('No main landmark found.'),
        primaryHeading: !checked.warnings.includes('No primary page heading found.'),
      },
      warnings: checked.warnings,
      note: 'Automated source checks only. Manual functional, accessibility, browser, security and performance QA is still required.',
      checkedAt: new Date().toISOString(),
    };

    await db`
      UPDATE public.website_builds
      SET generated_files = ${JSON.stringify(checked.files)}::jsonb,
          qa_report = ${JSON.stringify(qa)}::jsonb,
          model_used = ${result.model},
          generated_at = now(),
          status = 'qa',
          updated_at = now()
      WHERE id = ${id}
    `;

    await db`
      INSERT INTO public.activity_log
        (department, event_type, summary, entity_type, entity_id, metadata)
      SELECT 'delivery', 'website_source_generated',
        ${'Website source generated for ' + String(build.project_name)},
        'project', project_id,
        ${JSON.stringify({ website_build_id: id, model: result.model, qa_status: qa.status, warnings: checked.warnings.length })}::jsonb
      FROM public.website_builds WHERE id = ${id}
    `;

    return NextResponse.json({
      build_id: id,
      status: 'qa',
      model: result.model,
      files: Object.keys(checked.files),
      qa,
      message: 'Website source generated and stored privately. It has not been published; manual QA and owner approval are still required.',
    }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Website generation failed.';
    return NextResponse.json({ error: message.slice(0, 500) }, { status: 502 });
  }
}
