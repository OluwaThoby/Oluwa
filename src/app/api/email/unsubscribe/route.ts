import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { hashUnsubscribeToken } from '@/lib/email/unsubscribe-token.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Unsubscribe service temporarily unavailable.' }, { status: 503 });
  }

  let token = '';
  const contentType = request.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await request.formData();
      token = String(form.get('token') || '');
    } else if (contentType.includes('application/json')) {
      const body = await request.json();
      token = typeof body.token === 'string' ? body.token : '';
    } else {
      return NextResponse.json({ error: 'Unsupported request format.' }, { status: 415 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid unsubscribe request.' }, { status: 400 });
  }

  const tokenHash = hashUnsubscribeToken(token);
  if (!tokenHash) return NextResponse.json({ error: 'This unsubscribe link is invalid or expired.' }, { status: 410 });

  try {
    const db = neon(process.env.DATABASE_URL);
    const rows = await db`
      WITH token_record AS MATERIALIZED (
        SELECT email_normalized, consumed_at
        FROM public.email_unsubscribe_tokens
        WHERE token_hash = ${tokenHash} AND expires_at > now()
      ),
      active_token AS MATERIALIZED (
        SELECT email_normalized FROM token_record WHERE consumed_at IS NULL
      ),
      add_suppression AS (
        INSERT INTO public.email_suppressions (email_normalized, reason, source)
        SELECT email_normalized, 'unsubscribe', 'one_click_unsubscribe'
        FROM active_token
        ON CONFLICT (lower(email_normalized)) DO NOTHING
        RETURNING email_normalized
      ),
      consume_token AS (
        UPDATE public.email_unsubscribe_tokens
        SET consumed_at = COALESCE(consumed_at, now())
        WHERE token_hash = ${tokenHash} AND expires_at > now()
        RETURNING email_normalized
      ),
      suppress_prospect AS (
        UPDATE public.prospects p
        SET status = 'suppressed', updated_at = now()
        FROM consume_token t
        WHERE lower(p.business_email) = t.email_normalized
        RETURNING p.id
      )
      SELECT email_normalized, (SELECT consumed_at IS NOT NULL FROM token_record) AS previously_consumed
      FROM token_record
    `;

    if (!rows.length) return NextResponse.json({ error: 'This unsubscribe link is invalid or expired.' }, { status: 410 });
    return NextResponse.json({ status: 'unsubscribed', message: 'The address has been added to the suppression list.' }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Unsubscribe service temporarily unavailable. Please retry.' }, { status: 503 });
  }
}
