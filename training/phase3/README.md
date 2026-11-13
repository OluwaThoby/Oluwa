# Phase 3 — Secure Training Infrastructure

**Status:** GPU/CUDA preflight passed on 13 November 2026. The remaining operational gate is a private checkpoint canary read-back from a fresh Kaggle session. No model training has started.

## Objective

Prepare a repeatable, low-cost, security-conscious environment for the first AgencyOS Intelligence fine-tuning pilot. Phase 3 does not train the model; it makes the training environment ready and verifiable for Phase 4.

## Decisions

| Area | Decision |
|---|---|
| First environment | Kaggle Notebooks, private notebook, GPU accelerator |
| Observed accelerator | NVIDIA Tesla T4; 14.56 GB reported VRAM in the user's prior session |
| Fallback | Google Colab free GPU only if Kaggle has no usable GPU |
| Budget | ₦0 for the first pilot; no paid GPU, subscription, API, or cloud resource |
| Training method | Standard LoRA with FP16 on T4; no full fine-tuning |
| Initial model size | 1.7B primary candidate; 3B challenger only after benchmark and memory check |
| Runtime | Python 3.10+; retain the accelerator provider's preinstalled CUDA/PyTorch stack |
| Initial sequence length | 512 tokens; increase only after a successful measured run |
| Persistence | Private Kaggle notebook-version output; never commit datasets, credentials, checkpoints or model weights to this repository |

**Implementation correction:** `training/scripts/train_lora.py` currently implements standard LoRA, not 4-bit QLoRA. This document now matches the actual runner. The 1.7B candidate is deliberately chosen to keep the first pilot modest on the observed T4. Do not install or assume bitsandbytes/4-bit support unless it is separately verified against the live CUDA runtime.

## Hardware requirements

- One NVIDIA GPU with at least 12 GB VRAM for a tightly constrained small-model LoRA pilot; 16 GB is preferred.
- 16–30 GB system RAM; 20 GB or more free working storage is useful.
- CUDA-enabled PyTorch compatible with the accelerator.
- Actual fit depends on model architecture, tokenizer, sequence length, batch size, optimizer, attention implementation and package versions.

Starting settings for the first 1.7B pilot:
- FP16 compute on T4 (do not assume BF16 support).
- Per-device batch size: 1.
- Gradient accumulation: 8.
- Gradient checkpointing: enabled.
- Maximum sequence length: 512.
- LoRA rank: 16.
- One GPU; no distributed setup or long-running job.

These are conservative starting settings, not a guarantee. Measure peak VRAM during a short run before increasing sequence length or batch size.

## Environment setup

### Kaggle (primary)
1. Keep the notebook private.
2. In notebook Settings, choose **Accelerator → GPU**.
3. Run `python preflight.py` (or the updated preflight notebook).
4. Confirm CUDA, GPU name, memory and tensor allocation.
5. Stop the GPU when idle. Kaggle free capacity and quotas can change.

### Colab (fallback)
Use only the free GPU if Kaggle has no usable GPU. Do not buy compute units or upgrade a plan. Free GPU availability and limits are dynamic.

## Security controls

- Use a private notebook and private storage locations.
- Only upload reviewed, minimized training data. Use synthetic examples for environment tests.
- Never upload client names, personal data, credentials, payment details, private project files or production database dumps.
- Keep access tokens in the provider's secret manager; never paste them into notebook cells, source files, logs or Git.
- Do not publish notebook outputs or public datasets/models.
- Do not push trained weights, adapters, checkpoints, datasets or logs to this repository.
- Keep a manifest of dataset version, model ID/revision, package versions, hardware, configuration and run ID; no raw examples or secrets.

## Preflight evidence already recorded

On 13 November 2026, the user-run Kaggle preflight reported:
- Python 3.13.16
- PyTorch 2.11.0+cu130
- CUDA available
- NVIDIA Tesla T4, 14.56 GB reported GPU memory
- CUDA allocation test passed
- System RAM 31.35 GB total / 29.71 GB available
- Temporary scratch write/read/delete passed

This confirms a working T4/CUDA allocation at that time. It does not prove the GPU remains available now or that files persist across sessions.

## Remaining operational acceptance

Use the isolated [persistence canary notebook](agencyos_persistence_canary.ipynb) and follow [CHECKPOINT_PERSISTENCE.md](CHECKPOINT_PERSISTENCE.md) to:
1. Create a harmless canary file in `/kaggle/working`.
2. Save a private notebook version so the output is persisted.
3. Start a fresh session and attach the previous private notebook output.
4. Read the canary back and verify its SHA-256.
5. Delete the working copy and stop the GPU.

**Do not mark Phase 3 fully closed until the fresh-session read-back succeeds.**

## Phase 4 handoff

Phase 4 may begin only after:
- Phase 2 benchmark identifies and records the selected immutable model revision.
- The model and dataset licences are approved for the intended use.
- A sanitized, reviewed dataset is approved.
- The free GPU preflight and private checkpoint persistence test pass.
- A tiny smoke-test configuration is sized for the detected GPU.

No model download, dataset upload, training run, paid service or API call is triggered by this Phase 3 preparation.
