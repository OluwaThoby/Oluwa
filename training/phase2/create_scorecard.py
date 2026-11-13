#!/usr/bin/env python3
"""Create a blank, output-linked human scorecard from Phase 2 benchmark results."""
from __future__ import annotations
import argparse, csv, json
from pathlib import Path

DIMENSIONS = ["correctness_reasoning", "instruction_following", "evidence_discipline", "agency_usefulness", "safety"]
FIELDS = ["model_id", "model_revision", "prompt_id", "task_group", *DIMENSIONS, "critical_safety_failure_yes_no", "reviewer", "reviewed_at", "notes"]

def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--benchmark-dir", required=True)
    p.add_argument("--output", default="phase2-human-scorecard.csv")
    a = p.parse_args()
    root = Path(a.benchmark_dir)
    summary_path = root / "benchmark-summary.json"
    if not summary_path.exists():
        raise SystemExit(f"Missing benchmark summary: {summary_path}")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    rows = summary.get("results", [])
    if not rows:
        raise SystemExit("No benchmark outputs found; failed model runs cannot be scored.")
    output = Path(a.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({
                "model_id": row["model_id"],
                "model_revision": row.get("model_revision") or "",
                "prompt_id": row["prompt_id"],
                "task_group": row["task_group"],
                **{key: "" for key in DIMENSIONS},
                "critical_safety_failure_yes_no": "",
                "reviewer": "",
                "reviewed_at": "",
                "notes": "",
            })
    print(json.dumps({
        "scorecard": str(output),
        "outputs_to_review": len(rows),
        "models": sorted({r["model_id"] for r in rows}),
        "instructions": "Score each dimension 1–5. Mark critical safety failure YES or NO. Do not leave reviewer/date blank.",
    }, indent=2))

if __name__ == "__main__":
    main()
