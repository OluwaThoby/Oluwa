import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  let owner = '';
  try {
    const { data } = await auth.getSession();
    const email = data?.user?.email?.trim().toLowerCase();
    owner = process.env.OWNER_EMAIL?.trim().toLowerCase() || '';
    if (!email || !owner || email !== owner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Could not verify your owner session. Sign in again.' }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  }

  try {
    const db = neon(process.env.DATABASE_URL);
    const [tables, planRows, profileRows] = await Promise.all([
      db`SELECT
        to_regclass('public.agent_tasks') IS NOT NULL AS agent_tasks,
        to_regclass('public.agent_task_events') IS NOT NULL AS agent_task_events,
        to_regclass('public.agency_business_profile') IS NOT NULL AS business_profile`,
      db`SELECT count(*)::int AS count FROM public.agent_tasks
        WHERE agent_key = 'orchestrator' AND task_type = 'strategic_plan'
          AND status = 'succeeded' AND output ? 'plan'`,
      db`SELECT version, updated_at FROM public.agency_business_profile
        WHERE owner_email = ${owner} LIMIT 1`,
    ]);
    const schema = tables[0] as Record<string, boolean>;
    const checks = [
      { id: 'database', label: 'Database connection', ok: true, detail: 'Connected to the configured database.' },
      { id: 'agent_tasks', label: 'Agent task storage', ok: Boolean(schema.agent_tasks), detail: schema.agent_tasks ? 'Agent task table is available.' : 'agent_tasks table is missing.' },
      { id: 'task_events', label: 'Audit event storage', ok: Boolean(schema.agent_task_events), detail: schema.agent_task_events ? 'Task event table is available.' : 'agent_task_events table is missing.' },
      { id: 'business_profile', label: 'Business Profile storage', ok: Boolean(schema.business_profile), detail: schema.business_profile ? 'Business Profile table is available.' : 'agency_business_profile table is missing.' },
      { id: 'plans', label: 'Saved operating plans', ok: Number(planRows[0]?.count ?? 0) > 0, detail: `${Number(planRows[0]?.count ?? 0)} saved strategic plan(s) found.` },
      { id: 'profile_data', label: 'Business Profile data', ok: Boolean(profileRows[0]), detail: profileRows[0] ? `Profile version ${profileRows[0].version} is saved.` : 'No business profile has been saved yet. This is setup work, not a system failure.' },
      { id: 'owner_email', label: 'Owner configuration', ok: Boolean(owner), detail: 'Owner access configuration is present.' },
      { id: 'ai_provider', label: 'AI provider configuration', ok: Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY), detail: 'At least one supported AI provider key is configured.' },
    ];
    return NextResponse.json({
      status: checks.every(c => c.ok || c.id === 'profile_data') ? 'operational' : 'attention_required',
      checkedAt: new Date().toISOString(),
      checks,
      notes: [
        'This diagnostic performs read-only database checks.',
        'Provider configuration confirms that a key exists; it does not make a live AI inference request.',
        'Authenticated page actions still need a real browser-session check.',
      ],
    });
  } catch {
    return NextResponse.json({ error: 'Diagnostics could not complete. Check the database schema and runtime logs.' }, { status: 503 });
  }
}
