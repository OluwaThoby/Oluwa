# AgencyOS execution and authority architecture

## Design objective
AgencyOS is an execution-capable agency system, not a draft-only chatbot. Agents may research, create, test and carry out routine work. Authority is granted by the backend in narrowly defined scopes; a model prompt is never an authorisation mechanism.

## Authority layers
1. **Autonomous workspace work** — read approved business records, research public information, draft, plan, create code/content in a workspace, run tests and prepare previews.
2. **Scoped external execution** — send approved classes of email, publish approved content, deploy a named client project, or make bounded production changes only when a valid owner/client grant authorises that exact permission and scope.
3. **Financial authority** — spending, purchases, subscriptions, refunds, transfers, payment initiation and contractual financial commitments always require a separate, explicit transaction-level owner approval. A general campaign or project grant cannot authorise money movement.
4. **Prohibited without a separate security design** — credential disclosure, privilege escalation, bypassing client access controls, destructive data operations, impersonation, and actions outside client/agency authority.

## The ten architectural principles
1. **Backend-enforced permissions:** tool adapters check permissions server-side before every side effect. System prompts are supporting guidance only.
2. **Least privilege:** each agent receives only the tools, records and permissions needed for its role.
3. **Scoped grants:** grants bind actor/agent, client, project, action, resource, environment, limits, approver and expiry. No wildcard "do anything" grants.
4. **Approval is specific:** approval records the exact action class and scope, not just a vague task title. Changing recipient, domain, environment, content or material payload invalidates approval when relevant.
5. **Financial separation:** financial actions never inherit ordinary execution permission. Approval is transaction-specific and records amount, currency, payee, purpose and idempotency key.
6. **Preflight and independent verification:** deployments require build, test, security, link, mobile and preview checks; publishing and email require content/recipient/policy checks. The verifier cannot approve its own work.
7. **Reversibility:** deployments retain a known-good rollback target; content edits keep revisions; operations use idempotency keys and compensating actions where possible.
8. **Auditability:** record actor, intent, input/output references, permission/grant ID, approver, timestamps, provider response and verification result. Never log secrets.
9. **Bounded autonomy:** per-agent rate limits, recipient/domain allowlists, project boundaries, concurrency limits, retry budgets, expiry and emergency stop.
10. **Truthful state:** queued, attempted, provider-accepted, delivered/published/deployed and independently verified are distinct states. Never report success based only on a request being sent.

## Approval lifecycle
proposed -> awaiting_approval -> approved_scoped -> executing -> verified
Exception states: rejected, expired, revoked, failed, rolled_back.

A grant is immutable once used; changes create a new grant/version. Revocation blocks future actions. Each action re-checks the grant at execution time to close time-of-check/time-of-use gaps.

## Permission catalogue

| Permission | Default | Approval and constraints |
|---|---|---|
| Read approved workspace data | Allow | Role- and client-scoped |
| Public research and audits | Allow | Respect site terms, rate limits and privacy |
| Draft code, content, email, proposals | Allow | Draft status only |
| Send prospect outreach | Deny until campaign grant | Approved sender, recipient segment, content policy, daily cap, suppression list and stop-on-complaint |
| Send client communications | Deny until client communication grant | Approved purpose, recipient, channel and boundaries |
| Publish content | Deny until channel/content grant | Content version and destination must match approval |
| Deploy client website | Deny until project release grant | Exact project/repository/domain/environment; preflight pass; preview/release approval; rollback available |
| Modify live website | Deny until project maintenance grant | Allowed paths/actions, backups, change window, monitoring and rollback |
| Spend/purchase/pay/refund/transfer | Always transaction approval | Exact payee, amount, currency, purpose and expiry |
| Delete or irreversibly alter data | Deny by default | Separate explicit approval and recovery plan |

## Deployment release protocol
1. Build in an isolated workspace/preview.
2. Run unit, integration, type, dependency/security, link, accessibility, mobile and performance checks appropriate to the project.
3. Generate a release manifest containing commit/artifact hash, target project/domain/environment and test results.
4. Obtain approval bound to that manifest and target.
5. Re-check grant, target ownership and release manifest immediately before deploy.
6. Deploy with least-privilege credentials.
7. Verify the live target independently; on failed health checks, stop traffic or roll back when supported.
8. Record provider deployment ID, URL, verification and rollback result.

A preview approval is not production approval. A production approval for one version/domain is not approval for a later version or another domain.

## Email and publishing protocols
Email execution requires sender identity verification, recipient validation, suppression/unsubscribe checks where applicable, per-campaign and daily limits, duplicate prevention, content review, and bounce/complaint monitoring. Provider acceptance is not proof of inbox delivery.

Publishing requires destination/channel allowlisting, content-version approval, source/claims checks, scheduling boundaries and a revision/withdrawal path.

## Emergency stop
A global kill switch and per-client/per-agent pause must stop new external side effects immediately. In-flight operations must be tracked and safely completed, cancelled or compensated. Triggers include credential compromise, unexpected recipient/domain, repeated provider errors, unusual volume, security findings, scope mismatch or failed post-deployment health checks.

## Current implementation boundary
The repository currently has a draft-generation agent executor and an approve_draft decision flow. It does **not** yet have production email, CMS publishing or client deployment adapters, nor the durable scoped-grant database/API described above. The new execution-policy module classifies action intent and validates a grant shape for future adapters; it does not create grants, perform side effects or enable execution. Financial actions remain denied even if accidentally included in a general grant.

Do not enable external execution until the grant store, approval UI, provider adapters, audit trail, kill switch, idempotency and end-to-end tests are implemented. Never represent a planned or queued action as completed.
