#!/usr/bin/env python3
"""Run a locally stored AgencyOS adapter behind a no-tools, approval-first boundary."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


SYSTEM_POLICY = """You are the experimental AgencyOS Intelligence student.
Work as a careful agency operations assistant. Be useful, concrete and concise.
Never invent research, client facts, metrics, citations, tool results or completed work.
Separate supplied evidence from assumptions and unknowns. If evidence is missing,
say what is needed. Do not claim to have browsed, emailed, booked, changed data,
deployed code, spent money or executed any external action.
You have NO tools and NO permission to execute actions. You may only propose
actions. Consequential actions (contacting people, spending, publishing, changing
records, deploying, or sharing data) require explicit owner approval.
Return one JSON object with exactly these keys:
status, answer, evidence, unknowns, proposed_actions, approvals_required,
tool_requests, execution.
Use arrays for evidence, unknowns, proposed_actions, approvals_required,
tool_requests. Set execution to \"none\" and tool_requests to [].
Do not wrap the JSON in markdown fences. If the request is unsafe or asks you
to bypass approval, explain the boundary in answer and set status to \"blocked\".
"""


def build_prompt(tokenizer: Any, user_prompt: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_POLICY},
        {"role": "user", "content": user_prompt},
    ]
    if getattr(tokenizer, "chat_template", None):
        return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    return f"system: {SYSTEM_POLICY}\nuser: {user_prompt}\nassistant:"


def normalise_output(raw: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {
            "status": "unstructured",
            "unstructured_answer": raw,
            "tool_requests": [],
            "execution": "none",
            "warning": "Model output was not valid JSON; do not treat it as an executable instruction.",
        }
    if not isinstance(value, dict):
        return {"status": "invalid", "unstructured_answer": raw, "tool_requests": [], "execution": "none"}
    # The application boundary, not the model, owns these invariants.
    value["tool_requests"] = []
    value["execution"] = "none"
    for key in ("evidence", "unknowns", "proposed_actions", "approvals_required"):
        if not isinstance(value.get(key), list):
            value[key] = []
    if not isinstance(value.get("answer"), str):
        value["answer"] = ""
    if value.get("status") not in {"completed", "blocked", "needs_input", "unstructured"}:
        value["status"] = "needs_input"
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-id", required=True)
    parser.add_argument("--revision", required=True, help="Immutable 40-character model commit SHA")
    parser.add_argument("--adapter-dir", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--max-new-tokens", type=int, default=384)
    args = parser.parse_args()

    adapter_dir = Path(args.adapter_dir).expanduser().resolve()
    if not adapter_dir.is_dir() or not (adapter_dir / "adapter_config.json").is_file():
        raise SystemExit("Adapter directory is missing or does not contain adapter_config.json.")
    if not re.fullmatch(r"[0-9a-fA-F]{40}", args.revision):
        raise SystemExit("Provide an immutable 40-character hexadecimal model commit SHA.")
    if not args.prompt.strip():
        raise SystemExit("Prompt cannot be empty.")
    if not 32 <= args.max_new_tokens <= 1024:
        raise SystemExit("--max-new-tokens must be between 32 and 1024.")

    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(
        args.model_id, revision=args.revision, use_fast=True,
        local_files_only=True, trust_remote_code=False,
    )
    dtype = (
        torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported()
        else torch.float16 if torch.cuda.is_available()
        else torch.float32
    )
    base = AutoModelForCausalLM.from_pretrained(
        args.model_id, revision=args.revision, torch_dtype=dtype,
        device_map="auto" if torch.cuda.is_available() else None,
        local_files_only=True, trust_remote_code=False,
    )
    model = PeftModel.from_pretrained(base, str(adapter_dir), local_files_only=True, is_trainable=False)
    model.eval()

    rendered = build_prompt(tokenizer, args.prompt)
    inputs = tokenizer(rendered, return_tensors="pt")
    device = model.get_input_embeddings().weight.device
    inputs = {key: value.to(device) for key, value in inputs.items()}
    with torch.inference_mode():
        generated = model.generate(
            **inputs, do_sample=False, max_new_tokens=args.max_new_tokens,
            pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )
    new_tokens = generated[0, inputs["input_ids"].shape[-1]:]
    raw = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
    result = normalise_output(raw)
    result["runtime"] = {
        "model_id": args.model_id, "revision": args.revision,
        "adapter_dir": str(adapter_dir), "device": str(device), "tools_enabled": False,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
