#!/usr/bin/env python3
"""Read-only GPU environment check for the AgencyOS Phase 3 training pilot.

This script does not download models, read datasets, access the network,
start training, or persist any files.
"""
from __future__ import annotations

import platform
import sys


def main() -> int:
    print("AgencyOS Phase 3 — GPU preflight")
    print("=" * 42)
    print(f"Python: {platform.python_version()}")
    print(f"Platform: {platform.platform()}")

    if sys.version_info < (3, 10) or sys.version_info >= (3, 12):
        print("RESULT: BLOCKED — use Python 3.10 or 3.11 (3.11 preferred).")
        return 2

    try:
        import torch
    except Exception as exc:
        print(f"RESULT: BLOCKED — PyTorch import failed: {type(exc).__name__}: {exc}")
        return 2

    print(f"PyTorch: {torch.__version__}")
    print(f"PyTorch CUDA build: {torch.version.cuda or 'CPU-only'}")

    if not torch.cuda.is_available():
        print("RESULT: BLOCKED — CUDA GPU is not available in this runtime.")
        return 2

    device_count = torch.cuda.device_count()
    print(f"Visible CUDA devices: {device_count}")
    failures: list[str] = []

    for index in range(device_count):
        props = torch.cuda.get_device_properties(index)
        total_gib = props.total_memory / (1024 ** 3)
        capability = f"{props.major}.{props.minor}"
        print(
            f"GPU {index}: {props.name} | VRAM {total_gib:.2f} GiB | "
            f"compute capability {capability}"
        )
        if total_gib < 12:
            failures.append(f"GPU {index} has less than 12 GiB VRAM")

    # Test a small allocation and release; no model or dataset is loaded.
    try:
        device = torch.device("cuda:0")
        probe = torch.ones((1024, 1024), dtype=torch.float16, device=device)
        checksum = float(probe.sum().item())
        del probe
        torch.cuda.synchronize(device)
        torch.cuda.empty_cache()
        print(f"CUDA allocation test: PASS (checksum {checksum:.0f})")
    except Exception as exc:
        failures.append(f"CUDA allocation test failed: {type(exc).__name__}: {exc}")

    if failures:
        print("RESULT: BLOCKED")
        for failure in failures:
            print(f"- {failure}")
        return 2

    print("RESULT: PASS — environment meets the Phase 3 minimum.")
    print("Note: this is a hardware/runtime check, not proof that a specific model fits.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
