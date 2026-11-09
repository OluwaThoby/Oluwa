#!/usr/bin/env python3
"""Validate reviewed demonstrations and create group-isolated chat datasets."""

from __future__ import annotations

import argparse
import json
import random
from collections import defaultdict
from pathlib import Path
from typing import Any

ALLOWED_ROLES = {"system", "user", "assistant"}
ALLOWED_ACCESS = {
    "official_api",
    "licensed_dataset",
    "human_authored",
    "other_permitted",
}


def validate(row: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for key in ("id", "task_group", "capability", "messages", "provenance", "review"):
        if key not in row:
            errors.append(f"missing {key}")

    messages = row.get("messages")
    if not isinstance(messages, list) or not messages:
        errors.append("messages must be a non-empty array")
    else:
        for index, message in enumerate(messages):
            if not isinstance(message, dict):
                errors.append(f"message {index} must be an object")
                continue
            if message.get("role") not in ALLOWED_ROLES:
                errors.append(f"message {index} has an invalid role")
            if not isinstance(message.get("content"), str) or not message["content"].strip():
                errors.append(f"message {index} has empty content")
        if not any(m.get("role") == "assistant" for m in messages if isinstance(m, dict)):
            errors.append("at least one assistant message is required")

    provenance = row.get("provenance", {})
    if not isinstance(provenance, dict):
        errors.append("provenance must be an object")
    else:
        if not provenance.get("provider") or not provenance.get("model"):
            errors.append("provenance provider and model are required")
        if provenance.get("access_method") not in ALLOWED_ACCESS:
            errors.append("provenance access_method is not recognised")
        if provenance.get("terms_reviewed") is not True:
            errors.append("terms_reviewed must be true")
        if provenance.get("access_method") == "other_permitted" and not provenance.get("source_reference"):
            errors.append("other_permitted requires source_reference")

    review = row.get("review", {})
    if not isinstance(review, dict) or review.get("status") != "approved":
        errors.append("only approved examples can enter training")
    else:
        if not review.get("reviewer") or not review.get("reviewed_at"):
            errors.append("approved examples require reviewer and reviewed_at")
        for score in ("correctness", "completeness", "safety"):
            value = review.get(score)
            if not isinstance(value, (int, float)) or not 0 <= value <= 100:
                errors.append(f"review.{score} must be between 0 and 100")
        if review.get("safety", 0) < 90:
            errors.append("safety score must be at least 90")

    return errors


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    source = Path(args.input)
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    rejected: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    with source.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
                errors = validate(row)
                row_id = str(row.get("id", ""))
                if row_id in seen_ids:
                    errors.append("duplicate id")
                seen_ids.add(row_id)
                if errors:
                    rejected.append({"line": line_number, "id": row_id, "errors": errors})
                else:
                    groups[str(row["task_group"])].append(row)
            except Exception as exc:  # malformed JSON is quarantined, never silently skipped
                rejected.append({"line": line_number, "errors": [f"invalid JSON: {exc}"]})

    # Split at task-group level to prevent near-identical tasks crossing splits.
    group_names = sorted(groups)
    random.Random(args.seed).shuffle(group_names)
    if len(group_names) < 3:
        raise SystemExit(
            f"Need at least 3 distinct task_group values for train/validation/test; got {len(group_names)}. "
            "The tiny fixture is only a validator smoke test, not a training dataset."
        )

    n = len(group_names)
    # Guarantee all three partitions are non-empty, even for the 3-group smoke test.
    test_count = max(1, int(n * 0.15))
    validation_count = max(1, int(n * 0.15))
    train_count = n - validation_count - test_count
    if train_count < 1:
        raise SystemExit("Could not create non-empty train/validation/test partitions.")
    train_end = train_count
    val_end = train_count + validation_count
    split_groups = {
        "train": set(group_names[:train_end]),
        "validation": set(group_names[train_end:val_end]),
        "test": set(group_names[val_end:]),
    }

    counts: dict[str, int] = {}
    for split, selected_groups in split_groups.items():
        rows = [row for group in selected_groups for row in groups[group]]
        target = output / f"{split}.jsonl"
        with target.open("w", encoding="utf-8") as handle:
            for row in rows:
                handle.write(json.dumps({"messages": row["messages"]}, ensure_ascii=False) + "\n")
        counts[split] = len(rows)

    (output / "rejected.json").write_text(
        json.dumps(rejected, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    manifest = {
        "seed": args.seed,
        "source": str(source),
        "accepted_groups": len(group_names),
        "accepted_examples": sum(len(rows) for rows in groups.values()),
        "rejected_examples": len(rejected),
        "split_group_counts": {key: len(value) for key, value in split_groups.items()},
        "split_example_counts": counts,
        "warning": "A split with very few examples is not statistically meaningful.",
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    print(json.dumps(manifest, indent=2))
    if rejected:
        print(f"Quarantined {len(rejected)} invalid examples; inspect {output / 'rejected.json'}")


if __name__ == "__main__":
    main()
