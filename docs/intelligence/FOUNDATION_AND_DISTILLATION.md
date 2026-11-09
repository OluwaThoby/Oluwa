# AgencyOS Intelligence — Foundation & Distillation Strategy

## Mission

Build an independent, agency-specialised AI system. It should become unusually capable at research, website engineering, SEO, sales operations, client delivery and business management. It is not intended to imitate a proprietary assistant or claim universal frontier-level intelligence.

## What “use the performance of existing AIs” means

Use strong existing models as *teachers and evaluators* where their terms permit:
- Create carefully specified tasks that test a capability.
- Obtain teacher demonstrations through authorised interfaces or licensed datasets.
- Store task, context, teacher output, provenance, model/version, licence/terms basis and quality review.
- Have a separate evaluator critique the demonstration against explicit criteria.
- Reject unsafe, incorrect, unverifiable or low-quality traces.
- Build a curated, deduplicated dataset.
- Fine-tune an open-weight student model only where its licence permits.
- Compare the student against held-out tests and the teacher baseline.
- Keep improving from reviewed real AgencyOS work.

This is capability distillation, not combining or copying proprietary model weights. Subscription access does not automatically grant permission to scrape, export, train on, or redistribute model outputs. We must check each provider's current terms and use permitted access.

## Architecture

1. **Student foundation model** — an open-weight model with a licence compatible with our intended use.
2. **Capability curriculum** — task families for reasoning, research, software engineering, web design, SEO, sales, writing, document analysis, vision and verification.
3. **Teacher-data pipeline** — provenance-aware demonstrations, critique, filtering and dataset versioning.
4. **Training pipeline** — supervised fine-tuning first; preference optimisation only after we have reliable preference pairs and evaluation gates.
5. **Agency harness** — planner, bounded executor, memory, tools, permissions, retries and audit events.
6. **Verifier** — independent tests and evidence checks; never treats confidence as proof.
7. **Evaluation lab** — repeatable held-out scenarios, regression tests, capability scores and cost/latency tracking.
8. **Runtime** — deployable model adapter that can run locally or on a controlled inference host.

## First development milestones

### M0 — Foundation contracts
- Define capability taxonomy and model profiles.
- Define task, risk, approval and evaluation schemas.
- Add initial behavioural evaluation cases.
- Keep existing AgencyOS database and dashboard intact.

### M1 — Evaluation and dataset pipeline
- Add versioned task datasets and teacher-output provenance.
- Add human review labels and rejection reasons.
- Add automated scoring and regression reports.
- No fine-tuning until dataset quality and licensing are established.

### M2 — Student model selection
- Compare eligible open-weight models on the same held-out agency tasks.
- Measure quality, latency, hardware requirements, licence and inference cost.
- Select a baseline based on evidence, not popularity.

### M3 — First specialised fine-tune
- Fine-tune only on curated, permitted examples.
- Keep a held-out test set that is never used for training.
- Require measurable improvement without safety or truthfulness regressions.

### M4 — Agency execution runtime
- Connect the student to read-only workspace tools first.
- Add bounded execution, durable task state and independent verification.
- Add write and external-action tools only behind explicit owner approvals.

## Non-negotiable controls

- No fabricated execution, research findings, client results or test results.
- No autonomous spending, outreach, pricing commitments or production deployment.
- No model self-approval for high-impact actions.
- Every training trace records provenance and review status.
- Every promoted model passes held-out evaluations.
- Model weights, datasets and secrets are access-controlled.
- Preserve the current AgencyOS dashboard, Neon database and deployment.

## Cost and hardware reality

Open weights may be free to download, but training and inference require compute. Fine-tuning a small model can be feasible on rented or available GPU hardware; training a frontier model from scratch is not a realistic first milestone. We will benchmark before committing to paid infrastructure. No credits, subscriptions or GPU rentals are purchased without owner approval.
