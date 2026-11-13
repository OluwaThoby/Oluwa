# AgencyOS Intelligence Lab — Execution Roadmap

## Current state
- [x] Core capability taxonomy and task contracts.
- [x] Initial behavioural evaluation scenarios.
- [x] Teacher trace provenance contract.
- [x] Weighted evaluation scorer.
- [x] Benchmark run contract.
- [x] Dataset validation and group-based splitting script.
- [x] LoRA fine-tuning runner.
- [x] Local adapter inference script.
- [x] Model card template.
- [ ] Run automated Python tests in a compatible environment.
- [x] Kaggle Tesla T4/CUDA hardware preflight passed (user-run, 13 Nov 2026).
- [ ] Verify private checkpoint read-back after restarting the Kaggle session (runbook prepared).
- [x] Prepare Phase 1 curriculum taxonomy and 18-record draft pack (human review and terms approval still pending).
- [ ] Expand the approved dataset beyond smoke-test examples (drafts do not count).
- [x] Document Phase 2 candidate models and selection rule.
- [x] Prepare identical-task Phase 2 benchmark runner.
- [ ] Run both candidate models on the free T4 and independently score outputs.
- [ ] Record final model ID and immutable revision after benchmark.
- [ ] Run first controlled GPU fine-tune.
- [ ] Compare base model and adapter on held-out evaluations.
- [x] Implement a local-only Phase 5 inference harness with structured outputs and an application-enforced no-tools boundary.\n- [ ] Evaluate a real trained adapter against its base model and behavioural/safety suite.\n- [ ] Integrate only an approved student behind a separately enforced read-only AgencyOS tool boundary.

## Release gates

### Dataset gate
No training run unless every included record has traceable provenance, approved review status, safety score >= 90, and no unresolved sensitive data.

### Base-model gate
No final model lock based only on model size or public leaderboard claims. Verify model revision, licence, commercial terms, context length, inference support and actual AgencyOS task performance.

### Training gate
Record exact code commit, dependency versions, base model revision, dataset version, random seed, hardware, hyperparameters and output checksums.

### Evaluation gate
Use a held-out test set untouched by training or prompt tuning. Require independent scoring, no critical safety regression and truthful reporting. Perplexity alone is insufficient.

### Production gate
The student model starts with no external-action permissions. Read-only tools come first. Any write, outreach, spending or deployment permissions are independently enforced by the application and require owner approval.

## Work sequence
1. Stabilise and test data preparation.
2. Grow the curriculum using original human-authored tasks and properly licensed demonstrations.
3. Benchmark candidate models with repeatable prompts and scoring.
4. Train a small adapter on GPU infrastructure.
5. Evaluate, document and compare.
6. Iterate only where results show measurable improvement.
