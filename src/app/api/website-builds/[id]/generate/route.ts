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

function extractWebsiteFiles(text: string) {
  // HTML/CSS/JS contain many quotes and newlines. Asking a model to escape all
  // of that inside JSON is fragile, so use explicit file boundaries instead.
  const markers = [
    ['index.html', '<<<INDEX_HTML>>>', '<<<END_INDEX_HTML>>>'],
    ['styles.css', '<<<STYLES_CSS>>>', '<<<END_STYLES_CSS>>>'],
    ['script.js', '<<<SCRIPT_JS>>>', '<<<END_SCRIPT_JS>>>'],
  ] as const;
  const files: Record<string, string> = {};
  for (const [name, startMarker, endMarker] of markers) {
    const start = text.indexOf(startMarker);
    const end = text.indexOf(endMarker, start + startMarker.length);
    if (start < 0 && name === 'script.js') continue;
    if (start < 0 || end < 0) {
      throw new Error('The AI response was incomplete. Please try generating the website again.');
    }
    files[name] = text.slice(start + startMarker.length, end).trim();
  }
  if (files['index.html'] && files['styles.css']) return files;

  // Backward-compatible fallback for providers that still return valid JSON.
  const trimmed = text.trim();
  const candidate = trimmed.replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '');
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('The AI response was incomplete or malformed. Please try generating the website again.');
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new Error('The AI returned malformed website source. The build was not saved; please retry.');
  }
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
  if (Object.values(files).some((source) => /<{3,}\s*$/.test(source.trim()))) {
    throw new Error('The AI response appears to have been cut off mid-file. No website source was saved; retry generation.');
  }
  if (!/<\/html>\s*$/i.test(files['index.html']) || !/<\/body>/i.test(files['index.html']) || !/<\/head>/i.test(files['index.html'])) {
    throw new Error('The generated HTML is incomplete. No website source was saved; retry generation.');
  }
  const cssOpen = (files['styles.css'].match(/\{/g) || []).length;
  const cssClose = (files['styles.css'].match(/\}/g) || []).length;
  if (cssOpen !== cssClose) {
    throw new Error('The generated CSS is incomplete or malformed. No website source was saved; retry generation.');
  }
  const combined = Object.values(files).join('\n').toLowerCase();
  const blockers = [
    /<script[^>]+src\s*=\s*["']https?:/i.test(files['index.html']),
    /<iframe\b/i.test(files['index.html']),
    /javascript:/i.test(combined),
    /document\.cookie|localstorage|sessionstorage/i.test(combined),
    /<form\b/i.test(files['index.html']),
    /\bon[a-z]+\s*=/i.test(files['index.html']),
    /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/i.test(files['script.js'] || ''),
  ];
  if (blockers.some(Boolean)) {
    throw new Error('Generated source contains a disallowed script, form, inline event handler, network request, iframe, executable URL or browser storage access.');
  }
  const warnings: string[] = [];
  if (!/<meta[^>]+name=["']viewport["']/i.test(files['index.html'])) warnings.push('Missing responsive viewport metadata.');
  if (!/<title>/i.test(files['index.html'])) warnings.push('Missing document title.');
  if (!/<main\b/i.test(files['index.html'])) warnings.push('No main landmark found.');
  if (!/<h1\b/i.test(files['index.html'])) warnings.push('No primary page heading found.');
  if (!/<nav\b/i.test(files['index.html'])) warnings.push('No primary navigation found.');
  if (!/<footer\b/i.test(files['index.html'])) warnings.push('No footer found.');
  if ((files['index.html'].match(/<section\b/gi) || []).length < 2) warnings.push('The page needs more complete content sections.');
  if (files['styles.css'].trim().length < 600) warnings.push('The visual styling is too limited for a polished business website.');
  if (!/@media\s*\([^)]*(?:max-width|width\s*<=)/i.test(files['styles.css'])) warnings.push('No mobile CSS breakpoint was detected; check the layout on a narrow screen.');
  if (/@media[\s\S]*?(?:\.site-nav|nav)[^{]*\{[^}]*display\s*:\s*none/i.test(files['styles.css']) &&
      !/mobile[-_ ]?menu|aria-label=["']mobile/i.test(files['index.html'])) {
    warnings.push('The navigation may disappear on mobile without an accessible replacement.');
  }
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
    const checked = validateFiles(rows[0].generated_files);
    // Quality warnings require owner review but do not block a safe preview.
    // Structural and security failures still throw from validateFiles.
    return NextResponse.json({ build: rows[0], warnings: checked.warnings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load the private website source.';
    return NextResponse.json({ error: 'This saved draft failed the current safety checks. Regenerate it before previewing. ' + message.slice(0, 240) }, { status: 409 });
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
    if (['commerce', 'custom_app'].includes(String(build.complexity))) {
      return NextResponse.json({ error: 'This build is marked E-commerce or Custom Web Application. The current Website Studio generator only creates static Starter and Business website drafts; it cannot build a real cart, checkout, database, login or application backend. Change the build scope to Starter or Business, or complete a separately scoped application build.' }, { status: 422 });
    }
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
      maxOutputTokens: 8000,
      system: [
        'You are the senior website engineering specialist working under AgencyOS Chief AI.',
        'Create a visually polished, responsive static website draft. This is a front-end draft only, not a production-ready application or live site. Use a premium modern visual system: clean light background, strong readable contrast, generous whitespace, consistent max-width containers, carefully spaced typography, a distinctive hero, clear navigation, a primary call to action, at least three useful content sections and a considered footer. Avoid generic placeholder layouts, excessive cards, random gradients and cramped mobile layouts.',
        'FACTUAL ACCURACY IS MORE IMPORTANT THAN MARKETING COPY: use only business facts explicitly present in the supplied brief. A broad category such as freight forwarding, construction, consulting or healthcare is not proof of exact services, operating methods, coverage, certifications, guarantees or capabilities. Do not infer them. When detail is missing, use neutral wording such as “Service details to be confirmed” or clearly label a section “Proposed areas to confirm”; never state an unverified capability as fact.',
        'Mobile navigation must remain usable at every width. Do not hide the only navigation menu at mobile breakpoints. If you provide a mobile menu, implement it with addEventListener in script.js and an accessible button; otherwise wrap or stack navigation links. Include a real CSS mobile breakpoint.',
        'Return exactly three file sections using these literal boundaries, with raw source between them and no JSON, markdown fences or commentary: <<<INDEX_HTML>>> ... <<<END_INDEX_HTML>>> ; <<<STYLES_CSS>>> ... <<<END_STYLES_CSS>>> ; <<<SCRIPT_JS>>> ... <<<END_SCRIPT_JS>>>. The script section may be empty.',
        'The HTML must reference ./styles.css and ./script.js. Include semantic landmarks, accessible labels, mobile navigation if useful, metadata, and real useful content based only on supplied facts.',
        'Never invent client testimonials, certifications, addresses, phone numbers, prices, statistics or awards. If details are absent, use clear neutral copy without fake specifics.',
        'Do not include external scripts, iframes, remote fonts, trackers, analytics, browser storage, forms, inline event handlers, fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon, payment processing, credential collection or hidden network calls.',
        'Do not use placeholder company names, lorem ipsum, or fake contact details. Never invent business capabilities, credentials, service coverage, guarantees, prices or operating claims from a generic category. If facts are missing, keep the copy neutral and label the missing information for owner review. Do not create contact forms or pretend a message was sent or saved; there is no form backend. Use only anchor navigation and honest non-submitting calls to action.',
        'Keep source compact. Use no build tools or external dependencies. Do not include markdown fences.',
      ].join('\n'),
      prompt: 'Build the website from this verified project brief:\n' + JSON.stringify(brief),
    });

    const parsed = extractWebsiteFiles(result.text);
    const checked = validateFiles(parsed);
    const qa = {
      status: checked.warnings.length ? 'review_required' : 'passed_basic_checks',
      checks: {
        allowedFilesOnly: true,
        requiredFilesPresent: true,
        sourceSizeWithinLimits: true,
        noRemoteScriptsIframesOrBrowserStorage: true,
        responsiveViewport: !checked.warnings.includes('Missing responsive viewport metadata.'),
        mobileCssBreakpoint: !checked.warnings.includes('No mobile CSS breakpoint was detected; check the layout on a narrow screen.'),
        mobileNavigationAvailable: !checked.warnings.includes('The navigation may disappear on mobile without an accessible replacement.'),
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
    const rawMessage = error instanceof Error ? error.message : 'Website generation failed.';
    const message = /incomplete|cut off|output limit|MAX_TOKENS|malformed/i.test(rawMessage)
      ? 'The AI stopped before completing the website files. Nothing was saved. This can happen when the selected model reaches its output limit. Try a shorter brief; if it happens again, we need to change the model or generation strategy.'
      : rawMessage;
    return NextResponse.json({ error: message.slice(0, 500) }, { status: 502 });
  }
}
