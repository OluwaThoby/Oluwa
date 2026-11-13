# AgencyOS Student Model Lab

This directory is the first executable training workspace for an independent AgencyOS student model.

## Phase 1 curriculum status\n\nSee [`curriculum/PHASE1_DATASET_PLAN.md`](curriculum/PHASE1_DATASET_PLAN.md). An 18-record draft pack is in `data/phase1-draft-examples.jsonl`. These are synthetic, unreviewed drafts and are **not eligible for training**. Provider/model terms and every target response require real human review before any record is marked approved. The approved dataset gate remains closed.\n\n## What it does now

- Validates teacher demonstrations and their provenance.
- Builds deterministic train/validation/test splits by task group to reduce leakage.
- Converts approved examples into chat fine-tuning JSONL.
- Fine-tunes a compatible open-weight causal language model with LoRA using Hugging Face Transformers and PEFT.
- Saves adapter weights and a run manifest for reproducibility.

This does **not** train a frontier model from scratch. It fine-tunes an existing open-weight foundation model. The model and dataset licence must permit the intended use.

## Hardware reality

A GPU with sufficient VRAM is strongly recommended. Small 7B/8B models may need quantisation and a suitable GPU; actual requirements depend on model architecture, context length, batch size and quantisation. CPU-only training is possible for tiny experiments but is generally too slow for meaningful model development.

Do not run training on Vercel Functions or a phone. Use a GPU workstation or a rented GPU only after reviewing its cost. No GPU is rented or paid for by this repository.

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

Use Python 3.11 or 3.12 in a dedicated GPU environment:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

For Windows PowerShell, activate with `.venv\Scripts\Activate.ps1`.

## 1. Validate and split the dataset

```bash
python scripts/prepare_dataset.py --input data/example-traces.jsonl --output-dir artifacts/dataset --seed 42
```

The example dataset is deliberately tiny and is only a smoke test. It is not enough to train a useful model. Replace it with a reviewed dataset. The script splits by `task_group`, not by individual row, to reduce leakage.

## 2. Train a LoRA adapter

Choose a model whose licence and hardware requirements have been checked. Set its Hugging Face model ID:

```bash
python scripts/train_lora.py --model-id YOUR_APPROVED_MODEL_ID --dataset-dir artifacts/dataset --output-dir artifacts/agencyos-student --epochs 1
```

The script requires a CUDA-capable GPU. It intentionally refuses to run on CPU by default. For a small smoke test only, pass `--allow-cpu-smoke-test`.

## 3. Evaluate

The first evaluation step is a reproducible held-out loss/perplexity check, not proof of agent competence. Full promotion requires the AgencyOS behavioural evaluation suite, independent scoring, safety tests and real tool-use tests. Never let the model under test grade itself.

## Next engineering milestones

1. Grow a legally permitted, human-reviewed dataset across AgencyOS capabilities.
2. Benchmark candidate models on held-out agency tasks before choosing a base model.
3. Run LoRA fine-tuning on controlled GPU infrastructure.
4. Compare base vs adapter on held-out tests and safety regressions.
5. Only then connect the student model to read-only AgencyOS tools.
