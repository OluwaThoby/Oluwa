import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function isOwner() {
  const { data } = await auth.getSession();
  const email = data?.user?.email;
  return Boolean(email && process.env.OWNER_EMAIL && email.toLowerCase() === process.env.OWNER_EMAIL.toLowerCase());
}

export async function GET() {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  try {
    const db = neon(process.env.DATABASE_URL);
    const suppressions = await db`
      SELECT id, email_normalized, reason, source, prospect_id, notes, created_at
      FROM public.email_suppressions
      ORDER BY created_at DESC
      LIMIT 300
    `;
    return NextResponse.json({ suppressions });
  } catch {
    return NextResponse.json({ error: 'Suppression storage is not installed yet.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const reason = body.reason === 'legal_request' ? 'legal_request' : body.reason === 'unsubscribe' ? 'unsubscribe' : 'manual';
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    const db = neon(process.env.DATABASE_URL);
    const rows = await db`
      INSERT INTO public.email_suppressions (email_normalized, reason, source, notes)
      VALUES (${email}, ${reason}, 'owner_console', ${notes})
      ON CONFLICT (lower(email_normalized)) DO NOTHING
      RETURNING id, email_normalized, reason, created_at
    `;
    await db`UPDATE public.prospects SET status='suppressed', updated_at=now() WHERE lower(business_email)=${email}`;
    return NextResponse.json({
      suppression: rows[0] ?? null,
      alreadySuppressed: rows.length === 0,
      message: 'This address is now blocked from outreach.',
    }, { status: rows.length ? 201 : 200 });
  } catch {
    return NextResponse.json({ error: 'Could not add the suppression. Confirm the deliverability migration is installed.' }, { status: 503 });
  }
}
