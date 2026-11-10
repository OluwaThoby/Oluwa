import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { normalizeProviderEvent, suppressionReasonForEvent } from '@/lib/email/provider-events.mjs';
import { verifyEmailWebhookSignature } from '@/lib/email/webhook-signature.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: 'Webhook receiver is not configured.' }, { status: 503 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Webhook storage is not configured.' }, { status: 503 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
  }

  const timestamp = request.headers.get('x-agencyos-timestamp') || '';
  const signature = request.headers.get('x-agencyos-signature') || '';
  if (!verifyEmailWebhookSignature({ rawBody, timestamp, signature, secret })) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  let event;
  try {
    event = normalizeProviderEvent(JSON.parse(rawBody));
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invalid_event';
    return NextResponse.json({ error: code }, { status: 400 });
  }

  try {
    const db = neon(process.env.DATABASE_URL);
    const reason = suppressionReasonForEvent(event.eventType);
    const rows = await db`
      WITH inserted_event AS (
        INSERT INTO public.email_delivery_events
          (message_id, provider, provider_event_id, event_type, occurred_at, diagnostic_code, metadata)
        VALUES (
          ${event.messageId}::uuid, ${event.provider}, ${event.eventId},
          ${event.eventType}, ${event.occurredAt}::timestamptz,
          ${event.diagnosticCode},
          ${JSON.stringify({ ...event.metadata, recipient: event.recipient })}::jsonb
        )
        ON CONFLICT (provider, provider_event_id) DO NOTHING
        RETURNING id
      ),
      add_suppression AS (
        INSERT INTO public.email_suppressions (email_normalized, reason, source)
        SELECT ${event.recipient}, ${reason}, ${'provider_webhook:' + event.provider}
        WHERE ${reason}::text IS NOT NULL AND EXISTS (SELECT 1 FROM inserted_event)
        ON CONFLICT (lower(email_normalized)) DO NOTHING
        RETURNING email_normalized
      ),
      mark_prospect AS (
        UPDATE public.prospects
        SET status = 'suppressed', updated_at = now()
        WHERE lower(business_email) = ${event.recipient}
          AND ${reason}::text IS NOT NULL
          AND EXISTS (SELECT 1 FROM inserted_event)
        RETURNING id
      )
      SELECT (SELECT count(*)::int FROM inserted_event) AS inserted,
             (SELECT count(*)::int FROM add_suppression) AS newly_suppressed
    `;
    return NextResponse.json({
      received: true,
      duplicate: Number(rows[0]?.inserted ?? 0) === 0,
      suppressionApplied: Number(rows[0]?.newly_suppressed ?? 0) > 0,
    });
  } catch {
    return NextResponse.json({ error: 'Could not persist delivery event. Provider should retry.' }, { status: 503 });
  }
}
