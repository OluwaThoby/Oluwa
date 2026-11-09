#!/usr/bin/env python3
"""Run a local interactive session with a base model plus AgencyOS LoRA adapter."""

from __future__ import annotations

import argparse
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-model", required=True)
    parser.add_argument("--adapter", required=True)
    parser.add_argument("--max-new-tokens", type=int, default=512)
    parser.add_argument("--temperature", type=float, default=0.3)
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    tokenizer = AutoTokenizer.from_pretrained(args.adapter, use_fast=True)
    base = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        torch_dtype=dtype,
        device_map="auto" if device == "cuda" else None,
    )
    model = PeftModel.from_pretrained(base, args.adapter)
    model.eval()

    print("AgencyOS Student (local research build). Type /exit to quit.")
    history = [
        {
            "role": "system",
            "content": (
                "You are the AgencyOS student model. Be accurate and evidence-led. "
                "Never claim an action happened unless it was actually executed and verified. "
                "Never assume permission to send messages, spend money, or change production."
            ),
        }
    ]

    while True:
        try:
            user_text = input("\nYou: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nSession ended.")
            break
        if user_text.lower() in {"/exit", "/quit"}:
            break
        if not user_text:
            continue
        history.append({"role": "user", "content": user_text})

        prompt = tokenizer.apply_chat_template(
            history, tokenize=False, add_generation_prompt=True
        )
        inputs = tokenizer(prompt, return_tensors="pt")
        if device == "cuda":
            inputs = {key: value.to(model.device) for key, value in inputs.items()}

        with torch.inference_mode():
            output = model.generate(
                **inputs,
                max_new_tokens=args.max_new_tokens,
                do_sample=args.temperature > 0,
                temperature=max(args.temperature, 1e-5),
                top_p=0.9,
                repetition_penalty=1.05,
                pad_token_id=tokenizer.eos_token_id,
            )
        generated = output[0][inputs["input_ids"].shape[-1]:]
        answer = tokenizer.decode(generated, skip_special_tokens=True).strip()
        print(f"\nAgencyOS: {answer}")
        history.append({"role": "assistant", "content": answer})


if __name__ == "__main__":
    main()
