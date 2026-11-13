#!/usr/bin/env python3
"""Convert genuinely reviewed Phase 1 CSV rows into approved JSONL.

This importer is intentionally strict: it never treats the draft response as
approved content. A reviewer must supply the final rewritten response,
identity/date/scores, provenance details, and an explicit rights clearance.
Rows that are pending, rejected, incomplete, or use unsupported provenance
are reported and excluded.
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

ALLOWED_ACCESS = {"official_api", "licensed_dataset", "human_authored", "other_permitted"}
REQUIRED = {
    "draft_id", "task_group", "capability", "user_prompt",
    "review_decision", "reviewer", "reviewed_at_YYYY_MM_DD",
    "correctness_0_100", "completeness_0_100", "safety_0_100",
    "terms_and_rights_check", "approved_assistant_response",
    "provenance_provider", "provenance_model", "provenance_access_method",
    "provenance_source_reference", "rights_basis",
}


def score(row: dict[str, str], field: str, errors: list[str]) -> int | None:
    try:
        value = int(row.get(field, "").strip())
    except (TypeError, ValueError):
        errors.append(f"{field} must be an integer from 0 to 100")
        return None
    if not 0 <= value <= 100:
        errors.append(f"{field} must be from 0 to 100")
        return None
    return value


def convert(row: dict[str, str]) -> tuple[dict[str, Any] | None, list[str]]:
    errors: list[str] = []
    missing = sorted(key for key in REQUIRED if not row.get(key, "").strip())
    if missing:
        errors.append("missing required fields: " + ", ".join(missing))
    if row.get("review_decision", "").strip().upper() != "APPROVED":
        errors.append("review_decision must be APPROVED")
    if row.get("terms_and_rights_check", "").strip().upper() != "CLEARED":
        errors.append("terms_and_rights_check must be CLEARED")
    access = row.get("provenance_access_method", "").strip()
    if access not in ALLOWED_ACCESS:
        errors.append("provenance_access_method is not an allowed, documented value")
    correctness = score(row, "correctness_0_100", errors)
    completeness = score(row, "completeness_0_100", errors)
    safety = score(row, "safety_0_100", errors)
    if safety is not None and safety < 90:
        errors.append("safety score must be at least 90")
    prompt = row.get("user_prompt", "").strip()
    answer = row.get("approved_assistant_response", "").strip()
    if not prompt:
        errors.append("user_prompt is empty")
    if not answer:
        errors.append("approved_assistant_response is empty")
    if errors:
        return None, errors

    record = {
        "id": row["draft_id"].strip(),
        "task_group": row["task_group"].strip(),
        "capability": row["capability"].strip(),
        "messages": [
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": answer},
        ],
        "provenance": {
            "provider": row["provenance_provider"].strip(),
            "model": row["provenance_model"].strip(),
            "access_method": access,
            "terms_reviewed": True,
            "source_reference": row["provenance_source_reference"].strip(),
            "rights_basis": row["rights_basis"].strip(),
        },
        "review": {
            "status": "approved",
            "reviewer": row["reviewer"].strip(),
            "reviewed_at": row["reviewed_at_YYYY_MM_DD"].strip(),
            "correctness": correctness,
            "completeness": completeness,
            "safety": safety,
        },
    }
    return record, []


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Completed Phase 1 review CSV")
    parser.add_argument("--output", required=True, help="Approved JSONL destination")
    parser.add_argument("--report", default="phase1-import-report.json")
    args = parser.parse_args()

    accepted: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    with Path(args.input).open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing_headers = sorted(REQUIRED - set(reader.fieldnames or []))
        if missing_headers:
            raise SystemExit("Review CSV is missing required columns: " + ", ".join(missing_headers))
        for line, row in enumerate(reader, start=2):
            record, errors = convert(row)
            if errors:
                rejected.append({"line": line, "draft_id": row.get("draft_id", ""), "errors": errors})
            else:
                accepted.append(record)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as handle:
        for record in accepted:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    report = {
        "input": str(Path(args.input)),
        "accepted_count": len(accepted),
        "rejected_count": len(rejected),
        "accepted_ids": [item["id"] for item in accepted],
        "rejected": rejected,
        "warning": "Only rows with explicit human approval and rights clearance are imported. Review decisions are not inferred.",
    }
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if rejected:
        print("Some rows were excluded. Resolve the report before dataset preparation.")


if __name__ == "__main__":
    main()
