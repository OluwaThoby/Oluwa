# Payoneer payment support

## Current capability

AgencyOS supports Payoneer as a payment method for **manual reconciliation** in the Revenue workspace.

The owner may record a payment only after confirming that the funds have actually arrived and are available in the Payoneer account. The Payoneer transaction reference should be saved against the invoice. This updates AgencyOS's internal invoice and revenue records; it does not move money.

## Not connected

There is no Payoneer API integration, payment request creation, hosted checkout, webhook, balance lookup, payout, or automatic reconciliation. AgencyOS does not store Payoneer credentials.

## Database requirement

Apply `20261111_add_payoneer_payment_method.sql` only after explicit owner approval. Until then, the live database may reject a Payoneer payment record because its existing method constraint does not include `payoneer`. Do not represent the UI option as live-ready before the migration is applied and verified.

## Future API integration gates

Before enabling any Payoneer API operation:
- confirm the account and product are eligible for the intended API capability;
- obtain official developer/API access through Payoneer's own account process;
- store credentials only in a managed secret store, never in source code or chat;
- verify webhook authenticity and make event processing idempotent;
- reconcile provider transaction identifiers against invoice, currency and exact amount;
- keep receiving funds distinct from initiating a payment or payout;
- test in the provider's supported test environment before any live financial action.

Official developer documentation: https://www.payoneer.com/developers-docs/
