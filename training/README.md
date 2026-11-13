# AgencyOS Student Model Lab

This directory is the first executable training workspace for an independent AgencyOS student model.

## Phase 1 curriculum status

See [`curriculum/PHASE1_DATASET_PLAN.md`](curriculum/PHASE1_DATASET_PLAN.md). An 18-record draft pack is in `data/phase1-draft-examples.jsonl`. These are synthetic, unreviewed drafts and are **not eligible for training**. Provider/model terms and every target response require real human review before any record is marked approved. The approved dataset gate remains closed.

## Phase 2 — Base-model selection

See [`phase2/README.md`](phase2/README.md). The current first-pilot recommendation is `Qwen/Qwen3-1.7B`, with `HuggingFaceTB/SmolLM3-3B` as the challenger. The same-task GPU benchmark is prepared at `phase2/benchmark_candidates.py`. Human scoring tools are now available at `phase2/create_scorecard.py` and `phase2/evaluate_scorecard.py`; final selection is not locked until the benchmark outputs are independently scored.

## Phase 3 — Training infrastructure

See [`phase3/README.md`](phase3/README.md) and [`phase3/CHECKPOINT_PERSISTENCE.md`](phase3/CHECKPOINT_PERSISTENCE.md). The Kaggle T4/CUDA preflight passed in the user's prior session. An isolated notebook, `phase3/agencyos_persistence_canary.ipynb`, now tests private checkpoint persistence without rerunning the model benchmark. A fresh-session private checkpoint read-back remains the final operational gate.

## What it does now

- Validates teacher demonstrations and their provenance.
- Builds deterministic train/validation/test splits by task group to reduce leakage.
- Converts approved examples into chat fine-tuning JSONL.
- Fine-tunes a compatible open-weight causal language model with standard LoRA using Hugging Face Transformers and PEFT.
- Saves adapter weights and a run manifest for reproducibility.

This does **not** train a frontier model from scratch. It fine-tunes an existing open-weight foundation model. The model and dataset licence must permit the intended use.

## Hardware reality

A GPU with sufficient VRAM is strongly recommended. The first pilot targets a 1.7B model on a single free T4 using conservative LoRA settings. Do not run training on Vercel Functions or a phone. No GPU is rented or paid for by this repository.

## Dataset format

Store one JSON object per line in JSONL. See `data/example-traces.jsonl`.

Required fields:
- `id`
- `task_group`
- `capability`
- `messages` (chat messages with `role` and `content`)
- `provenance` (provider, model, access method, terms-reviewed flag, source reference)
- `review` (approved status and scores)

Only human-authored examples or teacher outputs whose current provider/dataset terms permit the intended training use should be included. A subscription does not automatically grant training rights. Never scrape private chat histories or hidden endpoints.

## Setup

Use Python 3.10+ in a dedicated GPU environment. Kaggle's Python 3.13 preflight was previously verified; confirm the installed Transformers/PEFT versions before running the benchmark or trainer.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 1. Validate and split the dataset

```bash
python scripts/prepare_dataset.py --input data/example-traces.jsonl --output-dir artifacts/dataset --seed 42
```

The example dataset is deliberately tiny and is only a smoke test. It is not enough to train a useful model. Replace it with a reviewed dataset. The script splits by `task_group`, not by individual row, to reduce leakage.

## 2. Train a LoRA adapter

Choose a model whose licence and hardware requirements have been checked. Set its Hugging Face model ID:

```bash
python scripts/train_lora.py --model-id YOUR_APPROVED_MODEL_ID --revision YOUR_IMMUTABLE_MODEL_COMMIT_SHA --dataset-dir artifacts/dataset --output-dir artifacts/agencyos-student --epochs 1 --max-length 512
```

The script requires a CUDA-capable GPU. It intentionally refuses to run on CPU by default. For a small smoke test only, pass `--allow-cpu-smoke-test`.

## 3. Evaluate

The first evaluation step is a reproducible held-out loss/perplexity check, not proof of agent competence. Full promotion requires the AgencyOS behavioural evaluation suite, independent scoring, safety tests and real tool-use tests. Never let the model under test grade itself.

## Phase 4 — controlled fine-tuning

See [phase4/README.md](phase4/README.md) for the entry gates, free-T4 run configuration, stop conditions and promotion rules. The trainer is implemented, but Phase 4 is **not started**: no approved dataset, benchmark-locked model or fresh-session persistence proof has been recorded yet. Do not launch training until all gates pass.

## Next engineering milestones

1. Complete genuine human review and provenance/terms checks for the Phase 1 dataset.
2. Run and independently score the Phase 2 candidate benchmark; record the selected immutable revision.
3. Complete Phase 3 fresh-session checkpoint read-back.
4. Execute the controlled Phase 4 LoRA pilot and compare the adapter with the base model on held-out behaviour and safety tests.


## Phase 5 — Guarded local agent integration

See [phase5/README.md](phase5/README.md). The local inference harness loads a previously produced adapter and exact base-model revision from local storage only. It has no tools, no network model downloads and no external-action execution. It is experimental and cannot be promoted until Phases 1–4 pass and the owner approves the evaluated artifact.
