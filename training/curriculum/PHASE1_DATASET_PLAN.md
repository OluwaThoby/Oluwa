# Phase 1 — AgencyOS training curriculum and dataset curation

## What is prepared
- 18 draft demonstrations covering prospect research, business analysis, sales, website engineering, SEO, finance/operations, client operations, agent safety and reasoning.
- Each record contains a task group, capability label, user prompt, proposed assistant target, provenance and an explicit pending review state.
- The drafts are synthetic curriculum material, not verified facts or approved training data.
- Existing `training/scripts/prepare_dataset.py` remains the only route into train/validation/test JSONL. It rejects unapproved records and records without reviewed provenance.

## Non-negotiable review gate
The new draft file is deliberately **not training-ready**. Do not change `review.status` to `approved`, set scores, or set `terms_reviewed=true` just to make the validator pass.

For every record, a human reviewer must:
1. Verify that the target response is correct, complete and useful for the stated task.
2. Check for invented facts, unsupported metrics, unsafe advice, privacy issues and overconfident claims.
3. Check the applicable provider/model terms before using model-generated text for training. If terms do not permit the intended use, rewrite the example as original human-authored material or exclude it.
4. Improve weak responses and add missing context; do not approve examples merely because they sound plausible.
5. Record a real reviewer identity, review date and correctness/completeness/safety scores. Safety must be at least 90/100.
6. Keep examples with unresolved issues in pending/rejected status.

## Dataset growth target
Before the first fine-tune, target at least 200 approved, diverse demonstrations across the capability groups, with enough independent task groups for leakage-resistant splits. This is a minimum working target, not a claim that 200 examples guarantee useful model behaviour. Aim for 500–1,000 reviewed examples before drawing strong conclusions about the specialist model.

Suggested distribution for the first 200:
- Prospect research and qualification: 30
- Business analysis and planning: 25
- Sales and ethical outreach: 25
- Website engineering and QA: 35
- SEO and content operations: 20
- Finance and agency operations: 20
- Client delivery and project management: 20
- Agent safety, tool use and verification: 25

Include successful, borderline and refusal/escalation cases. Avoid near-duplicates. Keep private customer data, credentials, payment details and production exports out of the dataset.

## How to validate after review
```bash
python training/scripts/prepare_dataset.py \
  --input training/data/approved-traces.jsonl \
  --output-dir artifacts/dataset \
  --seed 42
```

Inspect the manifest and rejected records. Do not train if any intended example is rejected, if a split is empty, or if task groups leak across splits. Keep the test split untouched until final evaluation.

## Phase 1 status
**Curriculum and draft pack prepared; final approval is pending human review and provenance/terms checks.** The 18 generated drafts are not counted as approved training examples. Phase 1 cannot be declared fully closed until a meaningful reviewed dataset is accepted by the validator.
