#!/usr/bin/env python3
"""Fine-tune an approved causal LM with assistant-only LoRA supervision."""

from __future__ import annotations

import argparse
import json
import platform
from datetime import datetime, timezone
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig, get_peft_model
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    DataCollatorForSeq2Seq,
    Trainer,
    TrainingArguments,
)

from sft_utils import labels_for_assistant_completion


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-id", required=True)
    parser.add_argument("--revision", required=True, help="Immutable model commit SHA selected in Phase 2")
    parser.add_argument("--dataset-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--epochs", type=float, default=1)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--grad-accumulation", type=int, default=8)
    parser.add_argument("--max-length", type=int, default=512)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--allow-cpu-smoke-test", action="store_true")
    args = parser.parse_args()

    if not torch.cuda.is_available() and not args.allow_cpu_smoke_test:
        raise SystemExit(
            "CUDA GPU not detected. Training on CPU is intentionally disabled by default. "
            "Use --allow-cpu-smoke-test only for a tiny pipeline check."
        )

    dataset_dir = Path(args.dataset_dir)
    for name in ("train.jsonl", "validation.jsonl", "test.jsonl"):
        if not (dataset_dir / name).exists():
            raise SystemExit(f"Missing {dataset_dir / name}; run prepare_dataset.py first.")

    raw = load_dataset(
        "json",
        data_files={
            "train": str(dataset_dir / "train.jsonl"),
            "validation": str(dataset_dir / "validation.jsonl"),
            "test": str(dataset_dir / "test.jsonl"),
        },
    )
    tokenizer = AutoTokenizer.from_pretrained(args.model_id, revision=args.revision, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    def render_and_tokenize(example):
        messages = example["messages"]
        if not messages or messages[-1].get("role") != "assistant":
            raise ValueError("Each training example must end with an assistant message.")

        if hasattr(tokenizer, "apply_chat_template"):
            full_ids = tokenizer.apply_chat_template(
                messages, tokenize=True, add_generation_prompt=False
            )
            prompt_ids = tokenizer.apply_chat_template(
                messages[:-1], tokenize=True, add_generation_prompt=True
            )
        else:
            prompt_text = "\n".join(
                f"{m['role']}: {m['content']}" for m in messages[:-1]
            ) + "\nassistant:"
            full_text = "\n".join(
                f"{m['role']}: {m['content']}" for m in messages
            )
            full_ids = tokenizer(full_text, add_special_tokens=True)["input_ids"]
            prompt_ids = tokenizer(prompt_text, add_special_tokens=True)["input_ids"]

        full_ids = full_ids[: args.max_length]
        prompt_length = min(len(prompt_ids), len(full_ids))
        labels = labels_for_assistant_completion(full_ids, prompt_length)
        return {
            "input_ids": full_ids,
            "attention_mask": [1] * len(full_ids),
            "labels": labels,
        }

    tokenized = raw.map(
        render_and_tokenize,
        remove_columns=raw["train"].column_names,
        desc="Tokenising assistant completions",
    )

    dtype = torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else (
        torch.float16 if torch.cuda.is_available() else torch.float32
    )
    model = AutoModelForCausalLM.from_pretrained(
        args.model_id,
        revision=args.revision,
        torch_dtype=dtype,
        device_map="auto" if torch.cuda.is_available() else None,
    )
    if torch.cuda.is_available():
        model.config.use_cache = False

    lora = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules="all-linear",
    )
    model = get_peft_model(model, lora)
    model.print_trainable_parameters()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    training_args = TrainingArguments(
        output_dir=str(output_dir),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=args.grad_accumulation,
        learning_rate=args.learning_rate,
        logging_steps=10,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        fp16=torch.cuda.is_available() and dtype == torch.float16,
        bf16=torch.cuda.is_available() and dtype == torch.bfloat16,
        gradient_checkpointing=torch.cuda.is_available(),
        report_to="none",
        remove_unused_columns=False,
    )
    # Preserve the -100 prompt mask while dynamically padding labels.
    collator = DataCollatorForSeq2Seq(
        tokenizer=tokenizer,
        model=None,
        padding=True,
        label_pad_token_id=-100,
    )
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        data_collator=collator,
    )
    trainer.train()
    test_metrics = trainer.evaluate(tokenized["test"], metric_key_prefix="held_out_test")
    model.save_pretrained(output_dir / "adapter")
    tokenizer.save_pretrained(output_dir / "adapter")

    manifest = {
        "model_id": args.model_id,
        "model_revision": args.revision,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "python": platform.python_version(),
        "torch": torch.__version__,
        "cuda_available": torch.cuda.is_available(),
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "gradient_accumulation_steps": args.grad_accumulation,
        "max_length": args.max_length,
        "max_length": args.max_length,
        "learning_rate": args.learning_rate,
        "training_objective": "assistant_completion_only",
        "held_out_test_metrics": test_metrics,
        "warning": "Loss metrics alone do not establish task competence or safety. Run the AgencyOS behavioural evaluation suite before promotion.",
    }
    (output_dir / "training-manifest.json").write_text(
        json.dumps(manifest, indent=2, default=str), encoding="utf-8"
    )
    print(json.dumps(manifest, indent=2, default=str))


if __name__ == "__main__":
    main()
