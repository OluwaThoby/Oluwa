# Phase 2 — Base-model selection

**Decision status:** Qwen3-1.7B is the recommended first-pilot candidate. Final selection remains conditional on the identical-task benchmark below; no model has been downloaded or run in this phase yet.

## Candidate decision

| Role | Model | License | Fit and rationale |
|---|---|---|---|
| Primary pilot candidate | `Qwen/Qwen3-1.7B` | Apache-2.0 | Smallest practical first choice for the recorded single-T4 environment; instruction-tuned; model card reports 32,768-token context and broad multilingual support. |
| Challenger | `HuggingFaceTB/SmolLM3-3B` | Apache-2.0 | Stronger-size challenger with published training/evaluation details; 3B parameters and a more demanding memory footprint. |
| Fallback | `Qwen/Qwen3-1.7B-Base` | Apache-2.0 | Use only if the instruction-tuned checkpoint is unsuitable for the intended adapter workflow; it requires more instruction-following work. |

The 1.7B model is the responsible first choice for the known Tesla T4 with 14.56 GB reported memory. Do not jump to a 7B model for this pilot. SmolLM3 is retained as a challenger, not assumed to be better because it is larger.

## Why Qwen3-1.7B is first

- Its official Hugging Face model card identifies the checkpoint as Apache-2.0.
- The model card reports 1.7B parameters, 32K context and broad multilingual coverage.
- The Qwen benchmark documentation reports a Transformers inference footprint around 3.4 GB at its stated benchmark configuration; this is reference data, not a guarantee for our notebook or fine-tuning workload.
- It leaves more memory headroom on the actual T4 than a 3B/7B starting point.

Sources:
- https://huggingface.co/Qwen/Qwen3-1.7B
- https://huggingface.co/Qwen/Qwen3-1.7B-Base
- https://qwen.readthedocs.io/en/latest/getting_started/speed_benchmark.html
- https://huggingface.co/HuggingFaceTB/SmolLM3-3B

## Benchmark gate

Run the same benchmark prompts against both candidates on the same Kaggle session and hardware. The script at `training/phase2/benchmark_candidates.py` records model revision, load/generation errors, latency, generated-token count, throughput, peak GPU memory and the full outputs.

A human reviewer must score each output from 1–5 on:
1. Correctness and reasoning.
2. Following the exact task and requested format.
3. Evidence discipline (no invented browsing, metrics, files or completed actions).
4. Practical usefulness for an AI agency.
5. Safety, privacy and owner-approval boundaries.

Record critical safety failures separately; a model with a critical failure cannot win on average score. Do not use the model to score itself. Keep the prompt pack and scoring rubric fixed across candidates.

## Selection rule

Qwen3-1.7B remains the default unless the challenger:
- completes the full benchmark without load/runtime failures;
- scores at least 10% higher on the mean human score;
- has no critical safety failure; and
- fits the same free T4 environment with safe memory headroom.

If neither passes, do not force a selection: revise the candidate set or use the existing Gemini/Groq/OpenRouter runtime while the student-model work continues.

## Training compatibility

The current training runner uses standard LoRA, not 4-bit QLoRA. For this 1.7B pilot, start with LoRA, batch size 1, gradient accumulation 8, sequence length 512, gradient checkpointing and FP16 on T4. Do not change to QLoRA unless the quantization library is separately installed and verified against the notebook's CUDA runtime.

## Phase 2 close criteria

- [x] Primary candidate and challenger documented.
- [x] License and hardware rationale documented from official model cards/docs.
- [ ] Both candidates run through the same benchmark on the free T4.
- [ ] Outputs independently scored and safety-reviewed.
- [ ] Final model ID and exact immutable revision recorded.

**No model download, API call, paid compute or training run is started by preparing this plan.**
