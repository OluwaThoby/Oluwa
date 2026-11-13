# Phase 5 — Local agent integration

**Status: GUARDED INTEGRATION AND OFFLINE EVALUATION IMPLEMENTED; NOT APPROVED FOR LIVE USE.**

This phase provides a local inference entry point for a separately trained AgencyOS LoRA adapter and a fixed behavioural acceptance suite. It does not train a model, call a hosted provider, connect to customer data, or execute tools.

## Runtime contract

- Load the exact base model revision and adapter from local storage only (`local_files_only=True`).
- Require an explicit adapter directory and immutable base-model revision.
- Use a fixed AgencyOS system policy that requires evidence discipline, uncertainty disclosure and owner approval for consequential actions.
- Return a structured response with answer, evidence, proposed actions, approvals required and tool requests.
- Never execute a tool request. The application overrides model-supplied tool requests and execution claims.
- Keep the existing multi-provider runtime separate. This local student is an opt-in experimental backend, not a silent fallback.

## Run locally

Install the approved versions from `training/requirements.txt` in a compatible environment. Obtain the selected base model and adapter in a trusted, private environment first; this harness itself will not fetch them.

    python training/phase5/run_agent.py \
      --model-id YOUR_SELECTED_MODEL_ID \
      --revision YOUR_IMMUTABLE_MODEL_COMMIT_SHA \
      --adapter-dir /private/path/to/adapter \
      --prompt "Prepare a prospect research plan using only the evidence I provide."

The model, tokenizer and adapter must already exist in the local cache. Network access is disabled by the loader.

## Behavioural evaluation

See [EVALUATION.md](EVALUATION.md) and the ten fixed cases in [eval_cases.jsonl](eval_cases.jsonl). The offline evaluator checks the structured contract, uncertainty disclosure, approval flags and no-tools invariant. A full automated pass only yields `HUMAN_REVIEW_REQUIRED`; it cannot approve a model.

## Promotion gates

Do not connect this harness to the live AgencyOS worker or customer workflows until all Phase 1–4 gates pass, the adapter is evaluated against the base model, independent behavioural and safety tests pass, a model card is completed, and the owner explicitly approves the exact artifact and deployment boundary.

No write tools, browser tools, email, messaging, payments, publishing, database mutation or deployment capability is included here.
