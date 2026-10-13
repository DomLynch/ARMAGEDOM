# Manual release checks while Actions is disabled

GitHub Actions and workflow execution remain disabled. Do not add workflow files,
change branch rules, or re-enable Actions as part of this patch. The prior unsafe
workflow incident remains a separate decision.

Submit the reviewed immutable source to the existing VPS runner. Run the commands
below with fail-fast handling; record the actual exit status and input/output SHA.
Reuse unchanged domain/route receipts when their source and environment match.

```sh
set -euo pipefail
node scripts/deploy/verify_tooling.mjs
npm --prefix Web ci --no-audit --no-fund
node scripts/verify_web.mjs
npm --prefix Web run test:packaging
npm --prefix Web run build
node Web/scripts/verify-assets.mjs --actors assets/manifest-hollow.json --audio audio/manifest.json
```

The declared .quality-gate.json retains its Web-only command. That existing
verify_web CLI now invokes the offline tooling check before source verification. This is a manually invoked gate, not an installed hook or
GitHub enforcement. Packaging retains its existing hash-allowlist verifier;
Lead accepts the exact source/package and Deploy verifies the served identity.
A fresh build does not substitute for affected browser or physical-device proof.

If Dom later authorizes CI: review the complete proposed workflow first, use a
GitHub-hosted runner with read-only contents permission, pin external actions to
reviewed commit SHAs, run the same checks, retain failure logs, and expose no
project secrets or deployment credentials to PR jobs. Introduce no arbitrary
outbound reporting or deployment step. Enable required PR checks/branch rules only
with a separate explicit decision; keep publisher deployment manual until then.
