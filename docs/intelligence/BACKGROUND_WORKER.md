# AgencyOS Background Worker

## Current boundary

The protected `POST /api/worker` endpoint is a worker processor, not a production activation switch. It requires a bearer `CRON_SECRET`, `DATABASE_URL`, and an explicitly configured AI runtime. It refuses to claim work when those prerequisites are missing.

The worker:
1. Claims a small batch through `public.claim_automation_runs`.
2. Reads the corresponding active automation definition and bounded workspace evidence.
3. Calls the configured AgencyOS model runtime for internal analysis or draft preparation.
4. Completes the run through `public.complete_automation_run` using the exact lease token returned by the claim operation.
5. Requeues failed attempts while the job's `max_attempts` limit has not been reached.

## Lease safety

A completion succeeds only when the run is still `running`, the supplied lease token matches, and the lease has not expired. A stale worker receives a null completion status and cannot overwrite a newer worker's result. The completion function clears lease metadata and limits result payloads to 64 KB.

The claim function uses `FOR UPDATE SKIP LOCKED`, a per-run random token, a bounded lease duration and bounded batch size. Expired leases are reclaimed on a later claim request. Failed attempts are requeued only while below the configured attempt limit.

## Supported internal task boundaries

- `prospect_research`: prepares an evidence-led brief from the prospect record and any saved audit evidence. It does not perform live web search or invent contact details.
- `seo_monitoring`: analyses the latest saved website audit. It does not crawl or re-audit the site.
- `report_generation`: drafts a report from supplied workspace evidence.
- `client_followup` and `invoice_reminder`: prepare internal drafts only; they never send messages or alter invoices.
- `general`: internal analysis using supplied input.

All job content is treated as untrusted data. External messages, payments, publishing, deployments, production changes and destructive operations are explicitly outside this worker's capability.

## Not activated

The lease migration is not applied to the primary database. No production worker secret or model runtime has been configured by this change. Workflow definitions remain paused, and no scheduler has been connected. No background jobs have been run by this implementation.

## Remaining verification gates

- Apply the additive migration to an isolated test branch and run real SQL behavior tests for competing claims, current/stale/expired lease completion, retry exhaustion and crash recovery.
- Add scheduled-run materialization with idempotent schedule keys and timezone/DST tests.
- Add a separately authorised, SSRF-safe live website-audit task adapter.
- Verify route-level integration and deployment configuration before any production activation.
