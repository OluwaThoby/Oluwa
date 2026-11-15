# AgencyOS — Product Requirements and Delivery Contract

Status: Owner-approved requirements baseline  
Repository: OluwaThoby/Oluwa  
Branch: feat/multi-provider-ai-runtime  
Product name: AgencyOS (working name; public agency brand remains undecided)

This document is the source of truth for the product decisions approved by the owner. Implementations must extend the existing AgencyOS application, database and deployment. Do not replace the current foundation or claim a capability is complete until its end-to-end acceptance checks pass.

## 1. Business and positioning

- Operate as a professional, independent digital agency serving Nigerian and international customers.
- Core services: custom website design and development, redesigns, ongoing website maintenance and SEO.
- Serve small businesses, startups and established companies.
- Public brand name is not final. Do not use “Thøby Agency” as the brand.
- Use the owner's normal email for now: nathanieloluwatobi11@gmail.com. A branded mailbox can be introduced later if a domain is acquired.
- AI is an internal production capability, not the primary sales proposition. Be truthful if a customer asks whether AI was used.
- Do not invent clients, testimonials, team members, case studies, pricing, revenue, capacity or business credentials.

## 2. Website production department

Build a specialised AI Website Development Department coordinated by Chief AI. It must support different project complexity levels, from simple business sites through e-commerce and custom web applications.

Required workflow:
1. Capture customer requirements and assets.
2. Chief AI clarifies ambiguity and produces a structured brief.
3. Estimate scope, complexity, effort, risks and price using transparent assumptions.
4. Present a proposal for owner/customer approval; never send a quote or make a commitment without approval.
5. After verified payment and accepted terms, create the client record, project workspace, brief, milestones, tasks and agent assignments.
6. Build the actual working website—not merely a mockup—in an isolated preview/staging environment.
7. Run automated checks for functionality, accessibility, responsive layouts, performance, security and broken links.
8. Present a preview for review and approval.
9. Deploy only after the required approval and verified hosting configuration.
10. Handover source/code, content, access and documentation according to the agreed ownership terms.

Agent-generated code must be reviewable, tested and traceable to a project/task. Secrets must never be placed in client-side code or generated into public repositories.

## 3. Customer website ownership and hosting

- After agreed payment terms are fulfilled, the customer owns the delivered website, code and content.
- The agency retains ownership of reusable internal tools, agent workflows, templates and proprietary systems.
- Support both agency-managed hosting and customer-owned hosting.
- Explain hosting, renewal, domain and third-party costs before purchase. Do not silently incur costs.
- A domain is not assumed to be available or included in a quote.

## 4. Customer portal and editing

Every delivered website should have a secure customer portal. Customers can:
- View project status, milestones, deliverables and approved previews.
- Communicate with the agency and submit change requests.
- Manage permitted content such as text, images, prices and contact details.
- Access website handover information and support history.

Editing workflow:
- Customer describes a change in plain language or uses approved manual content controls.
- Chief AI interprets the request, checks context and asks clarifying questions where needed.
- Specialist agent implements the change in staging, never directly on the live site.
- Automated tests and a preview are produced.
- Routine content changes may be approved by the customer.
- Major design, structural, functional, security-sensitive or technical changes require agency-owner approval.
- No change is published without the applicable approval.

## 5. Support, maintenance and monitoring

- Each completed website receives 30 days of free post-delivery bug support for defects attributable to the agency's development work.
- This is not unlimited new feature development or a free maintenance subscription.
- Offer ongoing maintenance separately; do not force a subscription.
- Monitor, where configured and authorised: uptime, broken links, SSL expiry, performance and security signals.
- Generate clear maintenance reports.
- On detection, investigate and diagnose automatically.
- Low-risk, well-understood fixes may be prepared and applied only after backup, staging tests and rollback readiness.
- Major, ambiguous or risky fixes require owner approval before production changes.
- Monitoring must respect customer consent, scope, rate limits and provider terms.

## 6. Redesign and optimisation

AgencyOS must support existing websites, not only new builds:
- Audit and redesign outdated websites.
- Improve responsive behaviour, accessibility, performance and SEO.
- Repair broken functionality and modernise user experience.
- Obtain customer authorisation before scanning, changing or migrating any website.
- Create private sample redesigns only for high-potential prospects. Never publish or represent a sample as approved work.

## 7. Lead generation and sales pipeline

Use legitimate, permitted sources such as public business directories, Google Maps, social platforms and company/startup directories. Respect source terms, privacy law, opt-outs and contact restrictions.

Pipeline:
Discovered → Researched → Qualified → Contacted → Replied → Negotiation → Won/Lost.

For each prospect:
- Verify facts from actual sources and retain source URLs and timestamps.
- Research the existing website and identify specific, evidence-based opportunities.
- Score opportunity with an explainable rubric; never present a score as a guarantee.
- Prepare a personalised pitch grounded in verified observations.
- Prepare sample redesigns only for high-potential prospects.
- Track every contact, response, follow-up, opt-out and stage transition.

Outreach safeguards:
- Do not spam, scrape prohibited sources, bypass platform limits or send bulk unsolicited messages.
- Check suppression/opt-out records before every send.
- Draft and queue messages for owner approval by default.
- No autonomous outreach until lawful basis, provider deliverability, suppression controls, rate limits and owner-approved sending policy are verified.
- Respect applicable Nigerian and recipient-country privacy and electronic marketing requirements.

## 8. Pricing and proposals

- Use tiered complexity levels.
- Estimate scope and effort transparently, with assumptions, exclusions, dependencies and confidence ranges.
- Do not produce artificially high or intimidating prices. Explain value and options clearly.
- Flag uncertain scope for clarification rather than guessing.
- Proposals and final prices require owner approval before they are sent or accepted.

## 9. Client onboarding and delivery automation

Only after payment is independently verified and contract/terms are accepted:
- Create client profile and project workspace.
- Generate a project brief and delivery plan.
- Create tasks, milestones, deadlines and dependencies.
- Assign specialist agents under Chief AI coordination.
- Notify the owner and customer appropriately.
- Keep a complete audit trail.
Payment verification must use a trusted payment provider/webhook with signature verification and idempotency—not a user-supplied screenshot alone.

## 10. Chief AI and agent governance

Chief AI is the supervisory coordinator. It:
- Interprets goals and customer requests.
- Checks business/project context and permissions.
- Breaks work into bounded tasks and delegates to specialists.
- Tracks dependencies, quality gates, errors and approvals.
- Requests clarification when requirements are ambiguous.
- Reports what actually happened, not what it intended to do.

Agents must use least-privilege access, scoped credentials, task leases, audit events, bounded retries and explicit approval gates. Untrusted customer/prospect content must never override system instructions or grant permissions.

## 11. Automation and operations

The agency should run routine internal work automatically through reliable scheduled jobs and event-driven workflows:
- Monitor approved websites.
- Refresh authorised prospect research.
- Prepare internal reports and reminders.
- Track project milestones and overdue tasks.
- Process queued work and retries safely.
- Notify the owner of failures and decisions requiring approval.

Automation must be observable, pauseable and recoverable. Include run history, last success, next run, failure reason and retry controls. Do not automatically spend money, sign contracts, publish major changes, send unapproved outreach or make commitments.

## 12. Account reset and testing

Before public launch, prepare a clean launch workspace and reset strategy. Do not delete production records or erase audit history without explicit owner approval and a backup. Testing data must be distinguishable from real customers and prospects. Test-day counters, trial periods or billing states must only be reset through the relevant provider's supported controls and only where permitted.

## 13. Delivery phases and acceptance gates

### Phase A — Foundation audit and launch safety
- Map existing pages, APIs, DB tables, agent types, email provider and scheduler.
- Identify what is implemented, partial, missing and unverified.
- Confirm environment configuration without exposing secrets.
- Add migration-backed schema changes only after reviewing existing schema.
- Acceptance: a verified capability matrix and clean build/test baseline.

### Phase B — Website production vertical slice
- Requirements intake → Chief AI brief → tiered estimate/proposal draft → owner approval → project creation → actual staging website → QA → preview approval → deployment/handover.
- Acceptance: one complete test project passes end-to-end in a non-production environment.

### Phase C — Customer portal
- Secure customer authentication and tenant-scoped access.
- Project progress, previews, support and change requests.
- Safe content editing and staged AI-assisted edits.
- Acceptance: one customer can only access their own projects and website.

### Phase D — Website monitoring and maintenance
- Consent/authorisation registry, scheduled checks, alerting, issue triage, staging fixes, backup and rollback.
- Acceptance: simulated issue is detected, reported and safely remediated without an unauthorised production change.

### Phase E — Lead generation and sales
- Source-compliant discovery, evidence-backed research, explainable qualification, pipeline, private samples and approved outreach.
- Acceptance: a prospect moves through the pipeline with auditable evidence and suppression checks.

### Phase F — Commercial and operational automation
- Verified payment webhooks, automatic onboarding, task assignment, email notifications, recurring schedules and monitoring.
- Acceptance: duplicate webhook/retry tests do not duplicate projects, charges, messages or jobs; owner can pause automation.

### Phase G — Launch readiness
- Security review, privacy review, deliverability checks, mobile QA, accessibility, backup/restore drill, incident handling and live authenticated E2E tests.
- Acceptance: no critical/high unresolved defects; all external actions have correct approvals; real sender identity and provider verified.

## 14. Non-negotiable release rule

A screen or button is not a completed feature. Mark a capability complete only after the backend, permissions, database, UI, error handling and end-to-end acceptance test all work. Keep a visible distinction between implemented, configured, tested and production-ready.
