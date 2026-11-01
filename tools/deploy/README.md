# Deploy cut tooling (record copy)

Copied read-only from the VPS `/mnt/HC_Volume_107195252` on 2026-11-01, generation 336 (the live cut, `three-20261028-336`).

**The VPS copies are the running ones; these files are the record.** Edit here only to keep the record in step with the VPS. Nothing here is executed from GitHub.

- `gencut.py NNN <sha> <fp> <deployDir>`: generates a cut's deploy directory and ops scripts (including `resume-publish.sh`, the flip).
- `cut336.sh`, `gate336.sh`, `install336.sh`, `mk336.py`, `mkmanifest336.py`: the latest per-cut set. Per cut, copy the previous set with the numbers shifted.
- `scripts/deploy/package_preview.py` (packaging) already lives in the repo root `scripts/deploy/`.
- Release procedure, flip checks and traps: see the Server & Deploy handover note (`arma-deploy.md`).

A scan for tokens, passwords, keys and DB URLs found none in these files. Keep it that way: read secrets from the environment, never embed them.
