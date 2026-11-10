# Email provider webhook integration

AgencyOS now has a provider-neutral delivery-event contract and a signed webhook receiver. It does not yet connect to a specific provider or send email.

## Receiver

`POST /api/webhooks/email`

Required environment:
- `EMAIL_WEBHOOK_SECRET`: random secret with at least 32 characters.
- `DATABASE_URL`: Neon connection string.

Required headers:
- `x-agencyos-timestamp`: Unix timestamp in seconds.
- `x-agencyos-signature`: lowercase or uppercase hex HMAC-SHA256 of `<timestamp>.<raw request body>`, optionally prefixed with `sha256=`.

The timestamp must be within five minutes. The body is capped at 64 KiB. Invalid signatures are rejected before parsing or database writes.

## Normalized event body

```json
{
  "provider": "provider_key",
  "eventId": "unique-provider-event-id",
  "eventType": "delivered",
  "recipient": "person@example.com",
  "occurredAt": "2026-11-10T12:00:00.000Z",
  "messageId": null,
  "diagnosticCode": null,
  "metadata": {}
}
```

Allowed event types: accepted, delivered, deferred, hard_bounce, soft_bounce, complaint, unsubscribed, rejected.

The receiver uses the provider + event ID uniqueness constraint for idempotency. Hard bounces, spam complaints and unsubscribes automatically add a suppression record and mark a matching prospect as suppressed in the same database statement. Soft bounces do not automatically suppress. Provider retries receive a success response for already processed events.

## Provider adapter boundary

A provider-specific adapter must verify the provider's native signature, validate its event schema, map its native IDs/statuses to the normalized contract, and only then forward a signed normalized event to this receiver. Do not configure a provider to call this endpoint directly unless it implements the documented signature contract.

No provider has been selected or connected. Do not invent provider credentials or expose secrets in chat. A future adapter must also pass provider policy review for the intended outreach use case before activation.
