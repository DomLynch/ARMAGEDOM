# Bounded release submission

Prepare the frozen project, `source-manifest.json` and selected `qa-config.json`
before submission. The config uses the existing `run.mjs` camera/HUD/weapon/animal
profile; do not add unrelated browser rows. Include these QA scripts in the staged
input. The runner keeps the existing source and packaging gates, then builds,
packages, serves that exact export on loopback and runs only the selected profile.
Each completed or failed stage writes its log and durable receipt. A browser
failure keeps the successful gates/package and partial browser artifacts.

From the existing WebUI checkout:

```sh
python3 scripts/qa/submit-release.py --timeout 600 --stage /absolute/frozen/input --output /absolute/new/attempt -- bash scripts/qa/release-run.sh
```

The local process recovers on completion even for EXIT1. It verifies original
input hashes, downloaded output hashes and export closure before deleting only
its own completed job folder. Missing original receipts, a failed copy or SSH
transport preserve the remote folder and fail visibly. Output directories must
be new: a retry cannot overwrite a failed attempt. Recovery timestamps and the
original job exit are retained.

For a same-package retry, prepare only the missing existing scenario and exact
verified export, then submit its existing `run.sh` through this same wrapper.
Do not repeat successful gates/builds. Optional `--handoff-stage /absolute/prepared/follow-up` automatically copies the
verified export into that existing stage without a rebuild or overwriting different
bytes; the authorised host's existing submission mechanism still
controls its job. This utility creates no daemon, monitor, hook or paid service.
