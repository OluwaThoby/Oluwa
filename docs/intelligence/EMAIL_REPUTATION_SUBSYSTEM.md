# Email reputation subsystem

AgencyOS keeps sender identity, suppression, provider events and reporting separate from the email provider adapter.

## Storage
- `email_sender_domains` records the exact From domain and independently checked SPF, DKIM, DMARC and alignment state. New domains start pending.
- `email_suppressions` stores normalized addresses with a unique case-insensitive key. Hard bounces, complaints and opt-outs are permanent campaign exclusions.
- `email_delivery_events` stores normalized provider events with a unique provider event ID to make webhook ingestion idempotent.

## Owner APIs
- `GET/POST /api/email-deliverability`: view 30-day aggregate metrics and register a sending domain as pending. Registration does not perform DNS verification or enable sending.
- `GET/POST /api/email-deliverability/suppressions`: inspect the suppression list and manually suppress an address. Suppression also marks matching prospect records as suppressed.

## Metric definitions
Provider acceptance and inbox placement are distinct. The dashboard reports acceptance only from normalized accepted/delivered and failure events, and never fabricates an inbox-placement rate. A null inbox placement value means it has not been independently measured.

## Security and current limits
All management routes are owner-only. No provider credentials are stored here. No email is sent. The database migration must be applied before these routes become available. Provider webhook ingestion must be implemented only after a sender is selected, with that provider's signature verification, event mapping and replay protections.
