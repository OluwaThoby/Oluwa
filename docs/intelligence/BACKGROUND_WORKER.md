# AgencyOS Background Worker

## Current boundary

The protected `POST /api/worker` endpoint is a worker processor, not a production activation switch. It requires a bearer `CRON_SECRET`, `DATABASE_URL`, an explicitly configured AI runtime, both lease migrations, the schedule-materialization migration, and two explicit environment gates: `WORKER_EXECUTION_ENABLED=true` and `SCHEDULER_TRIGGER_CONFIGURED=true`. It checks that every required database function exists before claiming anything.

The worker:
1. Claims owner-approved internal agent tasks through `public.claim_agent_tasks` and scheduled automation runs through `public.claim_automation_runs`, within one conservative total batch limit.
2. Reads the corresponding active automation definition and bounded workspace evidence.
3. Calls the configured AgencyOS model runtime for internal analysis or draft preparation.
4. Completes agent tasks through `public.complete_agent_task` and automation runs through `public.complete_automation_run`, using the exact lease token returned by the matching claim operation.
5. Requeues failed attempts while the job's `max_attempts` limit has not been reached.

## Scheduled execution

The worker tick first reads up to ten due active workflows, calculates the next matching occurrence in each workflow's IANA timezone, and asks Postgres to materialize one queued run. The database function locks the workflow row, compares the expected due timestamp, and inserts against a unique (job_id, scheduled_for) key. Concurrent scheduler ticks cannot create duplicate runs. Missed intervals are coalesced: at most one run is created per workflow per tick, and the next future occurrence is calculated from the current time, so a long outage does not create a burst of stale catch-up work.

Cron matching is evaluated in UTC instants against local timezone fields. This naturally skips nonexistent wall-clock times during spring DST transitions and can represent both repeated wall-clock times during autumn transitions. A five-minute GitHub Actions trigger is included; it calls the worker only when both repository secrets `AGENCYOS_WORKER_URL` and `CRON_SECRET` are present. The action runs from the default branch after merge. Configure the same strong secret in the hosting environment, then set `WORKER_EXECUTION_ENABLED=true` and `SCHEDULER_TRIGGER_CONFIGURED=true` only after the migrations, model provider, and scheduler secrets are verified. The trigger is best-effort every five minutes, not a real-time guarantee.

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
- The scheduled-run materialization migration was installed on the isolated branch. Metadata confirms `SECURITY INVOKER`, no PUBLIC execute privilege, per-job row locking, expected-due compare-and-swap, and the partial unique occurrence index.
- Rollback-contained SQL fixtures confirmed one run is created for a due active schedule, a repeated call cannot create a duplicate or advance a stale occurrence, and paused schedules cannot materialize. Fixture rollback was verified.
- Rollback-contained agent-task fixtures verified expired-lease recovery, rejection of a stale token, acceptance of the current token, failure requeue, retry exhaustion, and that a `waiting_approval` task remains untouched.
- A follow-up query confirmed zero agent-task test fixtures remained after rollback.
- Rollback-contained SQL fixtures verified that a reclaimed run rejects the old worker token, accepts the new token, and cannot be claimed a second time after completion.
- A simulated worker crash (expired lease) was recovered on the next claim, with the attempt counter incremented.
- A failed run was requeued after attempt one and became terminal after reaching its two-attempt limit.
- The fixture transaction was rolled back; a follow-up query confirmed zero test jobs and runs remained.
- The latest application unit-test workflow passed after the lease completion and worker authentication changes.

These checks were run against an isolated Neon branch, not the primary database. The sequential SQL checks do not replace a true simultaneous multi-session concurrency test, and the worker HTTP route has not yet had an authenticated end-to-end run against a deployed preview.

## Remaining verification gates

- Run a true simultaneous multi-session claim/materialization test and authenticated worker route integration test.
- Verify the five-minute GitHub Actions trigger with repository secrets after merge; it is intentionally inactive until configured.
- Add a separately authorised, SSRF-safe live website-audit task adapter. Current SEO monitoring only analyses the latest saved audit.
- Verify the complete production build and deployment configuration before any production activation.
