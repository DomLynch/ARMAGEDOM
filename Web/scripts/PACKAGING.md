# Runtime asset closure — Deploy handoff

Base a2acec135ef4c85a6cb452f27042a8849b1268fa. Only Web/scripts is changed.
Lead owns package/lock, actor loader, Web contract and root gate. No build/publish
or Unity job was run. Reuse canonical scripts/deploy/package_preview.py after
Lead pins the closure with release version/source fingerprint; no second packager.

Proposed package scripts (Lead applies):

```json
{
  "build": "vite build --base=./ && node scripts/verify-assets.mjs --prune",
  "verify:assets": "node scripts/verify-assets.mjs",
  "test:packaging": "node --test scripts/verify-assets.test.mjs"
}
```

Closure includes index HTML, reachable Vite hashed JS/CSS/chunks, selected actor
manifest/all unique model URLs/external glTF resources, and every world-manifest
file (lazy areas remain portable, not necessarily fetched at startup). CSS URL
resources must exist and match public copies. Actor/world hash+size fields are
required. Defaults match current actors.js/world.js selections; after changing
loader selection Lead passes --actors/--world and verifies generated code matches.

`--prune` removes only byte-identical unselected public copies from generated dist,
including unused originals; authoring public is untouched. Unknown/altered output,
unsafe paths, symlinks, missing/mismatched references and unreferenced scripts fail
BEFORE exclusions are deleted. Check-only mode rejects leftovers. JSON stdout
contains deterministic files/bytes for Lead's approved runtime export manifest.
CLI --dist/--public supports temporary fixtures, but rejects overlapping directories.
No timestamp, build command, runtime symlink, package dependency or network is added.

Evidence: ten focused Node fixture tests; pinned002 exact15files/60,812,679bytes
and a real18.44MB baseline Vagrant copy successfully excluded in temp directories.
Canonical receipt artifacts/threejs-hosting/asset-closure-checks.json. Lead runs the
single full build slot after wiring; Deploy did not run a competing build.

Limits: this is a current Vite/manifest contract, not a JavaScript interpreter.
Generated manifest string presence is a drift check, not proof of dynamic-loader
semantics. New audio/donor manifest schemas require a reviewed closure adapter;
CSS assets transformed/renamed by Vite currently require a matching public path
or fail closed. No physical-phone/performance/runtime acceptance is inferred.

## Donor pilot schema adapter — 2026-10-04

For Character0371f1e/Lead48c9921, select `--actors assets/donor/manifest.json`.
Hash metadata may be inline on models (002) or in donor `files` role records
`{file,bytes,sha256}`. Each model URL and optional `model.equipment.url` must
resolve to pinned metadata; conflicting inline/role or duplicate records fail.
Unused role records do not automatically add files to the runtime closure.
Equipment uses the same GLB/external-resource, source-equality and safe-path rules.

Lead package wiring for the donor build/verification:

```json
{
  "build": "vite build --base=./ && node scripts/verify-assets.mjs --prune --actors assets/donor/manifest.json",
  "verify:assets": "node scripts/verify-assets.mjs --actors assets/donor/manifest.json"
}
```

16 focused checks pass, including six donor cases. Actual warrior/Goblin/knife
13,583,364 bytes/hash records verified with current world files in a temp fixture.
Generated manifest references in that fixture are synthetic: no build/gameplay or
phone acceptance implied. Audio remains absent until WorldAudio's concrete schema.
Receipt: canonical artifacts/threejs-hosting/donor-closure-checks.json.
