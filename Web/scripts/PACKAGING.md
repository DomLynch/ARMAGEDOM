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
