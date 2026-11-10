# One-click unsubscribe

AgencyOS uses opaque, cryptographically random 256-bit tokens. Only a SHA-256 token hash is stored; the raw token is intended for the recipient's unsubscribe URL and must never be logged.

## Endpoint

`POST /api/email/unsubscribe`

Accepts an RFC 8058 `POST` to the recipient-specific URL with the opaque token in its query string and an `application/x-www-form-urlencoded` body containing `List-Unsubscribe=One-Click`. A valid, unexpired token inserts an `unsubscribe` suppression idempotently, marks matching prospects as suppressed, and consumes the token. Repeated requests remain safe; expired or unknown tokens return 410.

## Issuance contract

The trusted sender workflow must call `createUnsubscribeToken()`, store only `tokenHash` with the normalized recipient address and an expiry, and place the raw token in the recipient-specific unsubscribe URL. Never put an email address or other personal data in the token. The issuance route is deliberately not public; it belongs inside the future authorised send workflow.

The token-storage migration is separate from the email reputation migration and has not been applied to the live database. Email sending remains disabled until schema, provider, sender authentication and execution approvals are in place.
