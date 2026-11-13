# Phase 3 — Secure Training Infrastructure

**Status:** Kaggle GPU hardware preflight passed on 13 November 2026. Local scratch-storage write/delete and cross-session checkpoint persistence are not yet verified. No model download, training run, paid compute, or API call has been started.

## Objective

Prepare a repeatable, low-cost, security-conscious environment for the first AgencyOS Intelligence fine-tuning pilot. Phase 3 does not train the model; it makes the training environment ready and verifiable for Phase 4.

## Decision

| Area | Decision |
|---|---|
| First environment | Kaggle Notebooks, private notebook, GPU accelerator |
| Expected accelerator | NVIDIA T4 x2 (Kaggle retired P100 on 15 September 2026) |
| Fallback | Google Colab free GPU, only if Kaggle has no usable GPU |
| Budget | ₦0 for the first pilot; no paid GPU, subscription, API, or cloud resource |
| Training method | QLoRA (4-bit NF4) with LoRA adapters; no full fine-tuning |
| Initial model size | Prefer 1B–3B parameters for the first compatibility run |
| Stretch target | 7B only if the selected model, sequence length and measured peak VRAM fit safely |
| Runtime | Python 3.10+; retain the accelerator provider's preinstalled CUDA/PyTorch stack |
| Data | Sanitized, reviewed AgencyOS examples; synthetic/public data for environment tests |
| Persistence | Save only approved adapter/checkpoint artifacts to a private location; never commit datasets, credentials, checkpoints or model weights to this repository |

The Kaggle P100 was retired on 15 September 2026. Kaggle's current announcement identifies T4 x2 as the replacement. Each T4 has 16 GB VRAM; the two cards do **not** behave like one 32 GB GPU for a normal single-device QLoRA run. The initial configuration therefore targets one visible 16 GB device and a small model.

## Hardware requirements

### Minimum practical pilot target
- One NVIDIA GPU with **at least 12 GB VRAM** for a tightly constrained small-model QLoRA run.
- **16 GB VRAM preferred** (T4) to leave room for activations, optimizer state, sequence length and runtime overhead.
- 16–30 GB system RAM; 20 GB or more free working storage is useful.
- CUDA-enabled PyTorch and a GPU architecture supported by the selected quantization library.

These are planning thresholds, not a guarantee that every model will fit. Actual memory depends on architecture, tokenizer, context length, batch size, attention implementation and library versions.

### Starting QLoRA settings
- 4-bit NF4 quantization, double quantization enabled.
- FP16 compute on T4; do not assume BF16 support.
- Per-device batch size: 1.
- Gradient accumulation: 8–16.
- Gradient checkpointing: enabled.
- Initial maximum sequence length: 512; increase only after a successful short run.
- LoRA rank: 8 or 16 for the first pilot.
- No full fine-tuning, multi-GPU distributed setup, or long-running job in this phase.

A 7B QLoRA run may be possible on 16 GB with careful settings, but it is not the starting acceptance target. A clean 1B–3B run is more useful than an unstable larger run.

## Environment setup

### Kaggle (primary)
1. Sign in to Kaggle and create a **new private notebook**.
2. In notebook Settings, choose **Accelerator → GPU**. Expect T4 x2 where available; availability can be queued or temporarily unavailable.
3. Keep the notebook private. Do not attach raw customer records, credentials, production exports, or confidential client information.
4. Run `python /kaggle/input/.../preflight.py` after attaching this repository/file, or copy `preflight.py` into the notebook and run `!python preflight.py`.
5. Confirm the report detects a CUDA GPU and at least 12 GB total VRAM. For the planned T4 path, verify the device name and 16 GB per-device memory.
6. Stop the session immediately after the environment check. Do not leave an idle GPU running.

Kaggle's free GPU capacity is limited and may queue. Quotas and availability can change; this plan does not assume a guaranteed number of hours.

### Colab (fallback)
1. Open a new notebook using the same Google account used for the project.
2. Select Runtime → Change runtime type → T4 GPU (if offered).
3. Run the same preflight script.
4. Do not buy compute units or upgrade a plan. Free GPU availability and limits are dynamic and not guaranteed; free sessions can run for at most 12 hours depending on availability and usage.

## Security controls

- Use a private notebook and private storage locations.
- Only upload a reviewed, minimized dataset. For initial environment checks, use synthetic examples only.
- Do not upload client names, personal data, emails, phone numbers, credentials, payment details, private project files or production database dumps.
- Remove direct identifiers and secrets before any training dataset leaves its trusted source.
- Keep access tokens in the notebook provider's secret manager; never paste them into notebook cells, source files, logs or Git.
- Do not enable notebook output publishing or public dataset/model sharing.
- Do not push trained weights, adapters, checkpoints, datasets or logs to this GitHub repository.
- Use short-lived sessions. Stop the GPU when idle; do not run unattended workers.
- Keep a manifest of dataset version, model ID/revision, package versions, hardware, configuration and run ID. The manifest must not contain raw examples or secrets.
- Review model and dataset licenses before Phase 4. Do not assume an open-weight model is unrestricted for commercial use.

## Preflight acceptance checklist

Run `python preflight.py` inside the selected GPU notebook. The script accepts the current Kaggle Python 3.13 runtime and checks CUDA, VRAM, RAM (when psutil is available), local scratch capacity, and a temporary write/delete canary.

A passing environment must:
1. Report Python 3.10 or newer and import the preinstalled PyTorch stack successfully.
2. Import PyTorch successfully.
3. Detect CUDA and at least one NVIDIA GPU.
4. Report at least 12 GB total VRAM on the selected device; 16 GB is preferred.
5. Report the GPU name and compute capability.
6. Confirm that the runtime can allocate and release a small CUDA tensor.
7. Finish without downloading a model, accessing private data, or making an inference/training request.

**Phase 3 is technically ready for Phase 4 only after a real Kaggle or Colab session passes this checklist and the selected base model's license and memory fit are reviewed.** This repository change alone cannot prove a remote GPU is available.

## Phase 4 handoff

The next phase may begin only after:
- Phase 2 benchmark results identify the actual candidate model(s).
- The model license and source are approved.
- A sanitized training dataset version is approved.
- A real free GPU session passes preflight.
- A tiny smoke-test configuration is sized for the detected GPU.
- Checkpoint and adapter storage is private and tested.

No GPU session, model download, dataset upload, training run, or paid service is triggered by this Phase 3 preparation.

## References

- [Kaggle GPU usage](https://www.kaggle.com/docs/efficient-gpu-usage)
- [Kaggle notebook accelerators and hardware](https://www.kaggle.com/docs/notebooks)
- [Kaggle P100 retirement announcement (15 September 2026)](https://www.kaggle.com/product-announcements/735239)
- [Google Colab FAQ and resource limits](https://research.google.com/colaboratory/faq.html)
- [Hugging Face TRL SFTTrainer](https://huggingface.co/docs/trl/sft_trainer)
- [Hugging Face PEFT / QLoRA integration](https://huggingface.co/docs/trl/peft_integration)
- [bitsandbytes documentation](https://huggingface.co/docs/bitsandbytes/index)


## Actual Kaggle preflight evidence (user-run)

On 13 November 2026, the user ran the Kaggle notebook checks and reported:
- Python 3.13.16
- PyTorch 2.11.0+cu130
- CUDA available
- NVIDIA Tesla T4, 14.56 GB reported GPU memory
- CUDA allocation test passed
- System RAM 31.35 GB total / 29.71 GB available

This confirms a working T4/CUDA allocation at the time of that session. The original repository preflight incorrectly rejected Python 3.13; the updated script now accepts Python 3.10+ and matches the observed Kaggle runtime.

## Remaining operational acceptance

The following must still be run in the private Kaggle notebook:
1. Run the updated `agencyos_gpu_preflight.ipynb` (or `preflight.py`) and capture the full output, including scratch write/delete.
2. Choose the intended private checkpoint location. A temporary write/delete test only proves local scratch access.
3. Save a harmless private canary file to the intended checkpoint location, restart the notebook session, and read the canary back. Delete it after verification.
4. Keep the notebook private and stop the GPU session after testing.

**Do not call Phase 3 fully closed until cross-session private checkpoint read-back succeeds.** The T4 hardware gate has passed; persistence has not.
