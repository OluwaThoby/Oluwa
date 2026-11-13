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
- [ ] Run automated Python tests in a compatible environment.\n- [x] Kaggle Tesla T4/CUDA hardware preflight passed (user-run, 13 Nov 2026).\n- [ ] Verify private checkpoint read-back after restarting the Kaggle session.
- [x] Prepare Phase 1 curriculum taxonomy and 18-record draft pack (human review and terms approval still pending).\n- [ ] Expand the approved dataset beyond smoke-test examples (drafts do not count).
- [ ] Benchmark candidate base models on identical held-out tasks.
- [ ] Select base model after licence and hardware review.
- [ ] Run first controlled GPU fine-tune.
- [ ] Compare base model and adapter on held-out evaluations.
- [ ] Integrate the approved student behind a read-only AgencyOS tool boundary.

## Release gates

### Dataset gate
No training run unless every included record has traceable provenance, approved review status, safety score >= 90, and no unresolved sensitive data.

### Base-model gate
No model selection based only on model size or public leaderboard claims. Verify model revision, licence, commercial terms, context length, inference support and actual AgencyOS task performance.

### Training gate
Record exact code commit, dependency versions, base model revision, dataset version, random seed, hardware, hyperparameters and output checksums.

### Evaluation gate
Use a held-out test set untouched by training and prompt tuning. Require independent review, no critical safety regression and truthful reporting. Perplexity alone is insufficient.

### Production gate
The student model starts with no external-action permissions. Read-only tools come first. Any write, outreach, spending or deployment permissions are independently enforced by the application and require owner approval.

## Work sequence
1. Stabilise and test data preparation.
2. Grow the curriculum using original human-authored tasks and properly licensed demonstrations.
3. Benchmark candidate models with repeatable prompts and scoring.
4. Train a small adapter on GPU infrastructure.
5. Evaluate, document and compare.
6. Iterate only where results show measurable improvement.
