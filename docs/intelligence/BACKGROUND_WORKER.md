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

## Verification completed so far

- The completion function was installed and inspected on the isolated Neon test branch only. Metadata confirms `SECURITY INVOKER`, no PUBLIC execute privilege, lease-token checking, expiry checking and bounded retries.
- Rollback-contained SQL fixtures verified that a reclaimed run rejects the old worker token, accepts the new token, and cannot be claimed a second time after completion.
- A simulated worker crash (expired lease) was recovered on the next claim, with the attempt counter incremented.
- A failed run was requeued after attempt one and became terminal after reaching its two-attempt limit.
- The fixture transaction was rolled back; a follow-up query confirmed zero test jobs and runs remained.
- The latest application unit-test workflow passed after the lease completion and worker authentication changes.

These checks were run against an isolated Neon branch, not the primary database. The sequential SQL checks do not replace a true simultaneous multi-session concurrency test, and the worker HTTP route has not yet had an authenticated end-to-end run against a deployed preview.

## Remaining verification gates

- Run a true simultaneous multi-session claim test and authenticated worker route integration test.
- Add scheduled-run materialization with idempotent schedule keys and timezone/DST tests.
- Add a separately authorised, SSRF-safe live website-audit task adapter. Current SEO monitoring only analyses the latest saved audit.
- Verify the complete production build and deployment configuration before any production activation.
