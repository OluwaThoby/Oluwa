# AgencyOS Background Worker

## Current boundary

The protected `POST /api/worker` endpoint is a worker processor, not a production activation switch. It requires a bearer `CRON_SECRET`, `DATABASE_URL`, an explicitly configured AI runtime, and both lease migrations. It checks that all four claim/completion functions exist before claiming anything.

The worker:
1. Claims owner-approved internal agent tasks through `public.claim_agent_tasks` and scheduled automation runs through `public.claim_automation_runs`, within one conservative total batch limit.
2. Reads the corresponding active automation definition and bounded workspace evidence.
3. Calls the configured AgencyOS model runtime for internal analysis or draft preparation.
4. Completes agent tasks through `public.complete_agent_task` and automation runs through `public.complete_automation_run`, using the exact lease token returned by the matching claim operation.
5. Requeues failed attempts while the job's `max_attempts` limit has not been reached.

## Lease safety

A completion succeeds only when the task/run is still `running`, the supplied lease token matches, and the lease has not expired. A stale worker receives a null completion status and cannot overwrite a newer worker's result. Both completion functions clear lease metadata and limit result payloads to 64 KB. Agent-task claiming explicitly excludes `requires_approval = true` records.

The claim function uses `FOR UPDATE SKIP LOCKED`, a per-run random token, a bounded lease duration and bounded batch size. Expired leases are reclaimed on a later claim request. Failed attempts are requeued only while below the configured attempt limit.

## Supported internal task boundaries

- `prospect_research`: prepares an evidence-led brief from the prospect record and any saved audit evidence. It does not perform live web search or invent contact details.
- `seo_monitoring`: analyses the latest saved website audit. It does not crawl or re-audit the site.
- `report_generation`: drafts a report from supplied workspace evidence.
- `client_followup` and `invoice_reminder`: prepare internal drafts only; they never send messages or alter invoices.
- `general`: internal analysis using supplied input.

The same internal processor now consumes queued `agent_tasks` that are not marked as requiring approval. It preserves the assigned agent key and task type in the result. Approval-required tasks remain in `waiting_approval` and are not claimable.

All job content is treated as untrusted data. External messages, payments, publishing, deployments, production changes and destructive operations are explicitly outside this worker's capability.

## Not activated

Neither the automation-run lease migration nor the agent-task lease migration is applied to the primary database. No production worker secret or model runtime has been configured by this change. Workflow definitions remain paused, and no scheduler has been connected. No background jobs have been run by this implementation.

## Verification completed so far

- The automation-run completion function was installed and inspected on the isolated Neon test branch only. Metadata confirms `SECURITY INVOKER`, no PUBLIC execute privilege, lease-token checking, expiry checking and bounded retries.
- The agent-task lease migration was installed and inspected on the isolated Neon branch only. Metadata confirms `SECURITY INVOKER`, no PUBLIC execute privilege, exclusion of approval-required tasks, and lease-token/expiry checks.
- Rollback-contained agent-task fixtures verified expired-lease recovery, rejection of a stale token, acceptance of the current token, failure requeue, retry exhaustion, and that a `waiting_approval` task remains untouched.
- A follow-up query confirmed zero agent-task test fixtures remained after rollback.
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
