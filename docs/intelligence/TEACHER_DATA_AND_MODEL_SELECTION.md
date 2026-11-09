# Teacher Data, Dataset Governance & Student Model Selection

## Teacher model use

We do not merge closed model weights. We use authorised teacher outputs as demonstrations only when the applicable provider terms, dataset licence and law permit the intended collection and training use.

Every trace must preserve:
- Provider and exact model/version where available.
- Acquisition timestamp and permitted access method.
- Terms/licence review status and reference.
- Original task and unmodified response.
- Human or independent review scores.
- Rejection/quarantine status and reason.

No browser scraping of subscription chat histories, private accounts, hidden endpoints or rate-limit workarounds. A paid plan is not assumed to include training rights.

## Dataset quality

1. Create capability-specific tasks from real agency workflows.
2. Split tasks by scenario family before collecting demonstrations to reduce leakage.
3. Keep a held-out test set inaccessible to the training pipeline.
4. Deduplicate exact and near-duplicate traces.
5. Quarantine uncertain provenance, personally identifying information, secrets and unsafe content.
6. Require independent review for correctness, completeness and safety.
7. Version every dataset and record each transformation.
8. Never train on customer confidential data without a documented lawful basis and explicit permission.

## Model selection

We will compare candidate open-weight models on identical tasks and hardware where possible. Selection criteria:
- Held-out capability scores.
- Safety failures and instruction-following.
- Tool-use reliability and structured output.
- Context length under realistic workloads.
- Latency and throughput.
- Memory/VRAM requirements and quantisation quality.
- Commercial-use licence and redistribution conditions.
- Total cost to serve at our expected workload.

Do not select by parameter count, benchmark headlines or model popularity alone. Model availability and licence terms change; verify them at selection time.

## Promotion gate

A student model is eligible for AgencyOS staging only when:
- Held-out scores meet the agreed threshold.
- Safety score is at least 90/100 in every critical test category.
- No critical safety regression exists against the previous candidate.
- It passes the software tool-call and truthfulness regression suite.
- Model card, dataset versions, licence review and benchmark report are attached.

A model passing this gate does not receive unrestricted access to tools. Runtime permissions remain independently enforced.
