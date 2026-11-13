#!/usr/bin/env python3
"""Non-destructive AgencyOS Phase 3 GPU, capacity and scratch-storage preflight.

No model/data download, network access, API call, training, or persistent write.
A temporary canary is written and deleted to verify the selected local path.
"""
from __future__ import annotations

import os
import platform
import shutil
import sys
import tempfile
from pathlib import Path


def main() -> int:
    print("AgencyOS Phase 3 — environment preflight")
    print("=" * 48)
    print(f"Python: {platform.python_version()}")
    print(f"Platform: {platform.platform()}")

    if sys.version_info < (3, 10):
        print("RESULT: BLOCKED — Python 3.10 or newer is required.")
        return 2

    try:
        import torch
    except Exception as exc:
        print(f"RESULT: BLOCKED — PyTorch import failed: {type(exc).__name__}: {exc}")
        return 2

    print(f"PyTorch: {torch.__version__}")
    print(f"PyTorch CUDA build: {torch.version.cuda or 'CPU-only'}")
    failures: list[str] = []

    try:
        import psutil
        memory = psutil.virtual_memory()
        print(f"System RAM: {memory.total / (1024 ** 3):.2f} GiB total | "
              f"{memory.available / (1024 ** 3):.2f} GiB available")
    except Exception:
        print("System RAM: unavailable (optional psutil package not installed)")

    storage_path = Path(os.environ.get("AGENCYOS_CHECKPOINT_DIR", "/kaggle/working"))
    try:
        storage_path.mkdir(parents=True, exist_ok=True)
        usage = shutil.disk_usage(storage_path)
        print(f"Scratch/checkpoint path: {storage_path}")
        print(f"Disk: {usage.total / (1024 ** 3):.2f} GiB total | "
              f"{usage.free / (1024 ** 3):.2f} GiB free")
        with tempfile.NamedTemporaryFile(prefix="agencyos-preflight-", dir=storage_path,
                                         delete=True) as canary:
            canary.write(b"agencyos-phase3-storage-check")
            canary.flush()
        print("Temporary storage write/delete test: PASS")
    except Exception as exc:
        failures.append(f"Storage write/delete test failed: {type(exc).__name__}: {exc}")

    if not torch.cuda.is_available():
        failures.append("CUDA GPU is not available in this runtime.")
    else:
        count = torch.cuda.device_count()
        print(f"Visible CUDA devices: {count}")
        for index in range(count):
            props = torch.cuda.get_device_properties(index)
            gib = props.total_memory / (1024 ** 3)
            print(f"GPU {index}: {props.name} | {gib:.2f} GiB | "
                  f"compute capability {props.major}.{props.minor}")
            if gib < 12:
                failures.append(f"GPU {index} has less than 12 GiB VRAM.")

        try:
            probe = torch.ones((1024, 1024), dtype=torch.float16, device="cuda:0")
            checksum = float(probe.sum().item())
            del probe
            torch.cuda.synchronize()
            torch.cuda.empty_cache()
            print(f"CUDA allocation/release test: PASS (checksum {checksum:.0f})")
        except Exception as exc:
            failures.append(f"CUDA allocation test failed: {type(exc).__name__}: {exc}")

    if failures:
        print("RESULT: BLOCKED")
        for failure in failures:
            print(f"- {failure}")
        return 2

    print("RESULT: PASS — hardware, CUDA and local scratch storage checks passed.")
    print("IMPORTANT: a local write test does not prove checkpoint persistence across sessions.")
    print("Restart the notebook session and verify a private checkpoint can be read back before Phase 3 sign-off.")
    print("No model, dataset, API, or training operation was started.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
