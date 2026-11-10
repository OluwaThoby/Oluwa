import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function isOwner() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(email && process.env.OWNER_EMAIL &&
    email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase());
}

export async function GET() {
  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const configured = (names: string[]) => names.some((name) => {
    const value = process.env[name];
    return typeof value === 'string' && value.trim().length > 0;
  });

  const integrations = [
    {
      key: 'database',
      name: 'Agency database',
      category: 'Core infrastructure',
      configured: configured(['DATABASE_URL']),
      required: true,
      detail: 'Stores prospects, clients, projects, finance records and execution history.',
    },
    {
      key: 'model',
      name: 'AI inference runtime',
      category: 'AgencyOS Intelligence',
      configured: configured(['AI_GATEWAY_MODEL']) &&
        configured(['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN']),
      required: true,
      detail: process.env.AI_GATEWAY_MODEL
        ? 'A model ID and a recognised gateway credential are present. This checks configuration only, not live model access.'
        : 'Choose and configure an approved provider/model ID. No model is selected automatically.',
      model: process.env.AI_GATEWAY_MODEL || null,
    },
    {
      key: 'places',
      name: 'Business listings',
      category: 'Prospect discovery',
      configured: configured(['GOOGLE_PLACES_API_KEY', 'GOOGLE_MAPS_API_KEY']),
      required: false,
      detail: 'Enables an authenticated business-listing integration when its provider is configured.',
    },
    {
      key: 'search',
      name: 'Web research',
      category: 'Prospect discovery',
      configured: configured(['GOOGLE_SEARCH_API_KEY', 'SERPAPI_API_KEY', 'TAVILY_API_KEY']),
      required: false,
      detail: 'Enables programmatic web research. Manual search links remain available without it.',
    },
    {
      key: 'email',
      name: 'Email delivery',
      category: 'Outreach',
      configured: configured(['RESEND_API_KEY', 'POSTMARK_SERVER_TOKEN', 'SENDGRID_API_KEY']),
      required: false,
      detail: 'Required before the system can send outreach. Draft preparation does not require this integration.',
    },
    {
      key: 'worker',
      name: 'Background worker',
      category: 'Automation',
      configured: configured(['AGENCYOS_WORKER_URL']) &&
        configured(['AGENCYOS_WORKER_SECRET']),
      required: false,
      detail: 'Requires both a worker URL and shared secret. Scheduled jobs remain paused until execution is tested and approved.',
    },
    {
      key: 'payments',
      name: 'Payment provider',
      category: 'Revenue operations',
      configured: configured(['PAYSTACK_SECRET_KEY']) ||
        configured(['FLUTTERWAVE_SECRET_KEY']),
      required: false,
      detail: 'No payment gateway is connected based on the recognised server configuration keys.',
    },
  ];

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    checks: integrations,
    safety: {
      owner_only: true,
      outbound_email_requires_configuration: true,
      scheduled_jobs_default_paused: true,
      spending_requires_approval: true,
      production_changes_require_approval: true,
    },
    note: 'These are server-side configuration-presence checks, not provider connectivity tests. Secret values are never returned.',
  });
}
