# Guarded maintained UI runner

`run-checked.mjs` is the bounded supported same-export consumer for the mandatory
static submission gate. It loads a real game, rejects hidden Retry, navigates the
actual menu Settings / Retry & Reset disclosure, retries, cold-loads and repeats.
It writes `results/checked-ui.json` with exact game, config and consumer/helper
identity. It does not claim gameplay, enemy pressure or physical-phone acceptance.

Prepare from the stage root:

- An exact existing `export/` and `qa-checked-config.json` with `baseURL`, `expect`
  (`source`, `fingerprint`, `packageSha256`) and `driverFiles` mapping the three
  consumer/helper paths to actual SHA256: `run-checked.mjs`, `run-controls.mjs`,
  `ui-interaction-guard.mjs`, each under `scripts/qa/`.
- The pinned QA `package.json` and lockfile in the stage; declare Playwright
  through the static preflight external-package contract. The maintained wrapper
  installs them on the VPS because `vps-run.py` excludes `node_modules` on upload.
- Static entrypoint `scripts/qa/run-checked.mjs`; include the config as declared
  data. Consumer/helper paths and literal file reads are discovered by the AST
  preflight. The trusted helper hash must be in maintained policy, never added
  by the candidate.
- `QA_CHROMIUM_EXECUTABLE` set to the verified existing non-Snap browser binary.
  The runner checks its existence and records the actual browser version; it never
  downloads a browser or falls back to a default executable.
- The exact maintained command `bash scripts/qa/run-checked.sh`, through the
  checked submission launcher. It checks the known non-Snap Chromium, installs
  pinned QA dependencies without a browser download, then executes the runner.
  A direct command is not release-gate evidence.

The runtime receipt binds its config SHA and actual three driver hashes; the
static report binds the same files. It does not read the static report itself:
that would create a circular self-hash when resolving literal data dependencies.
The existing acceptance joins these identities with the recovered request/result.

`run.mjs` now consumes the same guarded UI routing for its direct actions, but its
12 imported legacy scenario modules and generated observer functions are **not**
claimed admitted by static preflight. They remain excluded until an actual needed
profile is migrated. Never trust an entire legacy module to bypass this boundary.
Existing release172 jobs/receipts are unchanged and are not reopened.
