import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function isOwner() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(email && process.env.OWNER_EMAIL && email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase());
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  if (!(await isOwner())) return jsonError('Unauthorized', 401);
  if (!process.env.DATABASE_URL) return jsonError('Database is not configured.', 503);

  try {
    const db = neon(process.env.DATABASE_URL);
    const [domains, suppressions, events, messageStates] = await Promise.all([
      db`SELECT id, domain, from_address, status, spf_status, dkim_status, dmarc_status, alignment_status, last_checked_at, verified_at, updated_at FROM public.email_sender_domains ORDER BY updated_at DESC LIMIT 50`,
      db`SELECT count(*)::int AS total FROM public.email_suppressions`,
      db`SELECT event_type, count(*)::int AS total FROM public.email_delivery_events WHERE occurred_at >= now() - interval '30 days' GROUP BY event_type`,
      db`SELECT status, count(*)::int AS total FROM public.messages WHERE direction='outbound' AND created_at >= now() - interval '30 days' GROUP BY status`,
    ]);

    const eventCounts = Object.fromEntries(events.map((row: { event_type: string; total: number }) => [row.event_type, row.total]));
    const accepted = Number(eventCounts.accepted ?? 0) + Number(eventCounts.delivered ?? 0);
    const attempted = accepted + Number(eventCounts.hard_bounce ?? 0) + Number(eventCounts.soft_bounce ?? 0) + Number(eventCounts.rejected ?? 0);
    return NextResponse.json({
      windowDays: 30,
      domains,
      suppressionCount: Number(suppressions[0]?.total ?? 0),
      events: eventCounts,
      messageStates,
      metrics: {
        providerAcceptanceRate: attempted ? Number((accepted / attempted * 100).toFixed(2)) : null,
        hardBounceRate: attempted ? Number((Number(eventCounts.hard_bounce ?? 0) / attempted * 100).toFixed(2)) : null,
        complaintCount: Number(eventCounts.complaint ?? 0),
        inboxPlacementRate: null,
        inboxPlacementNote: 'Not measured. Provider acceptance is not proof of inbox placement.',
      },
      sendingEnabled: false,
    });
  } catch {
    return jsonError('Email deliverability storage is not installed yet. The database migration must be applied first.', 503);
  }
}

export async function POST(request: Request) {
  if (!(await isOwner())) return jsonError('Unauthorized', 401);
  if (!process.env.DATABASE_URL) return jsonError('Database is not configured.', 503);

  try {
    const body = await request.json();
    const domain = typeof body.domain === 'string' ? body.domain.trim().toLowerCase() : '';
    const fromAddress = typeof body.from_address === 'string' ? body.from_address.trim().toLowerCase() : '';
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) {
      return jsonError('Enter a valid sending domain.', 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromAddress) || fromAddress.split('@')[1] !== domain) {
      return jsonError('The From address must use the exact sending domain.', 400);
    }

    const db = neon(process.env.DATABASE_URL);
    const rows = await db`
      INSERT INTO public.email_sender_domains (domain, from_address)
      VALUES (${domain}, ${fromAddress})
      ON CONFLICT (domain) DO UPDATE SET
        from_address = EXCLUDED.from_address,
        updated_at = now()
      WHERE public.email_sender_domains.status IN ('pending', 'paused')
      RETURNING id, domain, from_address, status, spf_status, dkim_status, dmarc_status, alignment_status
    `;
    if (!rows.length) return jsonError('This domain is already verified or failed. Use a separate review process before changing it.', 409);
    return NextResponse.json({ senderDomain: rows[0], message: 'Domain recorded as pending. DNS has not been checked and sending remains disabled.' }, { status: 201 });
  } catch {
    return jsonError('Could not save the sender domain. Confirm the email deliverability migration is installed.', 503);
  }
}
