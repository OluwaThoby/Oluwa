# Phase 4 — Controlled LoRA fine-tuning

**Status: NOT STARTED.** The trainer is implemented, but a training run is deliberately blocked until the Phase 1–3 acceptance gates pass. No checkpoint or adapter has been produced.

## Purpose

Fine-tune the selected open-weight foundation model into an AgencyOS specialist using approved, provenance-checked demonstrations. This is supervised LoRA fine-tuning, not training a model from scratch and not a replacement for the existing Gemini/Groq/OpenRouter runtime.

## Hard entry gates

Do not start the trainer until all are true:

- [ ] Phase 1: at least 200 diverse examples have been genuinely reviewed and approved; provenance and applicable training terms are checked for every record.
- [ ] Phase 1: prepare_dataset.py accepts the intended examples; inspect manifest.json and rejected.json; no intended record is silently ignored; task-group splits are non-empty and leakage-resistant.
- [ ] Phase 2: both candidates have completed the same benchmark; a human has scored outputs and reviewed safety; selected model ID and immutable revision are recorded.
- [ ] Phase 3: current free-GPU preflight passes and a private checkpoint canary is read back successfully from a fresh session.
- [ ] The model licence and dataset rights permit the intended fine-tuning and deployment.
- [ ] The notebook is private; only sanitized data is present; no credentials, client records or production exports are uploaded.

The 18 existing Phase 1 drafts are pending synthetic curriculum examples. They do not satisfy the dataset gate and must not be promoted by editing review fields without real review.

## Controlled first run

Use the free Kaggle T4 only. No paid GPU, API, subscription or hosted inference fallback is permitted for this pilot.

1. Pin the exact model revision selected in Phase 2.
2. Run dataset validation and inspect the complete manifest and quarantine report.
3. Start with one epoch, batch size 1, gradient accumulation 8, sequence length 512, LoRA rank 16, FP16 on T4.
4. Save adapter weights and the run manifest to private notebook output/storage only.
5. Stop immediately on CUDA OOM, unstable loss, NaN/Inf, unexpected data leakage, privacy exposure or unexplained training/evaluation mismatch. Do not silently retry on paid hardware.
6. Evaluate the adapter on the untouched held-out test split and the fixed AgencyOS behavioural/safety suite. Compare base vs adapter using the same prompts and independent human scoring.

## Promotion rule

A lower held-out loss is not proof of a better agent. Do not connect the adapter to live agency tools or customer workflows until it passes held-out evaluation without leakage; task correctness, instruction-following and evidence-discipline review; safety, privacy and refusal/escalation tests; regression comparison against the unmodified base model; and explicit owner approval.

Until then, the adapter remains an experimental artifact in private storage. Never commit datasets, model weights, adapters, checkpoints or raw run outputs to Git.

## Existing implementation

- Dataset validation/splitting: training/scripts/prepare_dataset.py
- LoRA trainer: training/scripts/train_lora.py
- Dependency list: training/requirements.txt

The current trainer uses standard LoRA, not QLoRA. Its held-out loss is only an initial metric; the behavioural evaluation and human review above remain mandatory.