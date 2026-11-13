# Phase 3 — Private checkpoint persistence acceptance

The Kaggle GPU and CUDA allocation test already passed on the user's T4 session. The only remaining Phase 3 operational gate is proving that a private checkpoint artifact survives a new session. A local `/kaggle/working` file alone does not prove persistence.

## Safe canary procedure (no model or customer data)

1. Open the existing private AgencyOS Kaggle notebook. Keep the notebook private.
2. Confirm the accelerator is GPU, then run the updated preflight.
3. Create a tiny text canary in the notebook's output directory:
   ```python
   from pathlib import Path
   import hashlib, json, datetime

   out = Path("/kaggle/working/agencyos-checkpoint-canary")
   out.mkdir(parents=True, exist_ok=True)
   payload = "AGENCYOS_PRIVATE_CHECKPOINT_CANARY_V1"
   (out / "canary.txt").write_text(payload, encoding="utf-8")
   manifest = {
       "purpose": "persistence-only-canary",
       "sha256": hashlib.sha256(payload.encode()).hexdigest(),
       "created_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
   }
   (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
   print("Canary created:", sorted(p.name for p in out.iterdir()))
   ```
4. Use Kaggle **Save Version / Save & Run All** so the notebook output is committed to a private notebook version. Do not publish it.
5. Start a fresh private notebook session and attach the prior notebook version's output as an input (Kaggle exposes committed notebook outputs under the notebook's input sources).
6. Read `canary.txt` and `manifest.json` from that attached output. Confirm the content and SHA-256 match. Do not rely on the original live session or its `/kaggle/working` directory.
7. Delete the canary from any working copy after verifying. Keep the source notebook private and stop the GPU session.

## Pass criteria

- A new session, not the original process, can read the saved canary.
- The canary content matches exactly.
- The SHA-256 matches the manifest.
- The artifact was stored in a private notebook output, not a public dataset or public model.
- No customer data, credentials, model weights or paid storage were used.

Record the date, notebook version reference, storage location, read-back result and reviewer in the Phase 3 handoff. Never put tokens or private credentials in the manifest.

## Current evidence

- [x] Kaggle Python 3.13 / PyTorch / CUDA environment detected.
- [x] NVIDIA Tesla T4 detected; CUDA tensor allocation passed.
- [x] Temporary scratch write/read/delete passed in the prior session.
- [ ] Private notebook output saved as a version.
- [ ] Canary read back from a fresh session.
- [ ] Final Phase 3 acceptance recorded.

**Do not mark Phase 3 complete until the fresh-session read-back passes.**
