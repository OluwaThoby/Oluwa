import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { isValidCron } from '@/lib/cron-validation.mjs';

export const dynamic = 'force-dynamic';

const ALLOWED_JOB_TYPES = new Set([
  'prospect_research',
  'seo_monitoring',
  'client_followup',
  'invoice_reminder',
  'report_generation',
  'general',
]);

async function isOwner() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(
    email &&
    process.env.OWNER_EMAIL &&
    email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase()
  );
}

function isValidCronField(field: string, min: number, max: number) {
  if (!field) return false;

  return field.split(',').every((part) => {
    if (!part) return false;

    const pieces = part.split('/');
    if (pieces.length > 2) return false;

    const [base, stepText] = pieces;
    if (stepText !== undefined) {
      if (!/^\d+$/.test(stepText)) return false;
      const step = Number(stepText);
      if (step < 1 || step > max - min + 1) return false;
    }

    if (base === '*') return true;

    if (base.includes('-')) {
      const range = base.split('-');
      if (range.length !== 2 || !range.every((v) => /^\d+$/.test(v))) return false;
      const start = Number(range[0]);
      const end = Number(range[1]);
      return start >= min && end <= max && start <= end;
    }

    if (!/^\d+$/.test(base)) return false;
    const value = Number(base);
    return value >= min && value <= max;
  });
}

function isValidCron(expression: string) {
  const fields = expression.trim().split(/\s+/);
  return fields.length === 5 && fields.every((field, index) => {
    const [min, max] = CRON_RANGES[index];
    return isValidCronField(field, min, max);
  });
}

export async function GET() {
  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    const db = neon(process.env.DATABASE_URL);
    const [jobs, runs] = await Promise.all([
      db`SELECT id,job_type,title,status,schedule_cron,timezone,config,next_run_at,last_run_at,max_attempts,consecutive_failures,created_at
          FROM public.automation_jobs ORDER BY created_at DESC LIMIT 100`,
      db`SELECT id,job_id,job_type,status,attempt_count,error_message,started_at,finished_at,created_at
          FROM public.automation_runs ORDER BY created_at DESC LIMIT 100`,
    ]);
    return NextResponse.json({ jobs, runs, execution_enabled: false });
  } catch {
    return NextResponse.json({ error: 'Could not load workflow centre.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    const body = await req.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const jobType = typeof body.job_type === 'string' ? body.job_type.trim() : '';
    const cron = typeof body.schedule_cron === 'string' ? body.schedule_cron.trim() : '';
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'Africa/Lagos';

    if (!title || title.length > 140 || !ALLOWED_JOB_TYPES.has(jobType)) {
      return NextResponse.json(
        { error: 'Enter a title and choose a supported workflow type.' },
        { status: 400 }
      );
    }

    if (cron.length > 120 || !isValidCron(cron)) {
      return NextResponse.json(
        { error: 'Enter a valid five-field cron schedule with values inside their allowed ranges.' },
        { status: 400 }
      );
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    } catch {
      return NextResponse.json({ error: 'Invalid timezone.' }, { status: 400 });
    }

    const config =
      body.config && typeof body.config === 'object' && !Array.isArray(body.config)
        ? body.config
        : {};
    const configJson = JSON.stringify(config);
    if (configJson.length > 8000) {
      return NextResponse.json({ error: 'Workflow configuration is too large.' }, { status: 400 });
    }

    const db = neon(process.env.DATABASE_URL);
    const rows = await db`INSERT INTO public.automation_jobs
      (job_type,title,status,schedule_cron,timezone,config,next_run_at)
      VALUES (${jobType},${title},'paused',${cron},${timezone},${configJson}::jsonb,NULL)
      RETURNING id,job_type,title,status,schedule_cron,timezone,config,next_run_at,created_at`;

    return NextResponse.json(
      {
        job: rows[0],
        message: 'Workflow saved as paused. No background execution has been enabled.',
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: 'Could not save workflow.' }, { status: 400 });
  }
}
