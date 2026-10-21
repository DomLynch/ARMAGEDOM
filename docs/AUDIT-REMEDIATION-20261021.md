# Audit remediation — 21 October 2026

Scope: isolated branch based on published 201 (`f06c17ec`), preserving concurrent
navigation 202 work and dirty canonical authoring. No deployment or phone claim.

## Findings and disposition

| Audit item | Verified finding and action |
| --- | --- |
| 97 failed tests | Reproduced exactly: 1,558 total, 1,461 pass, 97 fail. Fixed null touch selection and legacy worlds entering Reaper-only timestep validation. Updated obsolete fixture contracts while retaining corruption, quota, resource, geometry and disposal checks. Historical saves use genuine old schemas; no weakened fallback acceptance. |
| Formatting and LOC | Removed stale release/area facts from AGENTS and explicitly prohibit physical LOC as quality target. Kept changes bounded; whole-source formatting remains deferred to avoid obscuring review and concurrent integration. |
| Save wrapper chain | Architectural debt, not evidence of silent reset. Current writers and absent-key migrations preserve old bytes; occupied invalid saves fail closed and expose recovery state. Preserved codecs and keys; a schema rewrite is deferred rather than risking player saves. |
| Lossless assets | Corrected actor-loader default to selected Hollow manifest and added a fixture assertion. Unselected lossless comparison assets are already excluded from selected packages; retained originals rather than deleting provenance. |
| Art duplicates/LFS | Removed one proven byte-identical 5,327,020-byte Warden copy, retaining the original and a verified external recovery copy. No evidence for deleting other nonidentical assets. LFS/history rewriting and external asset-store migration remain deferred repository-wide decisions. |
| Validators/exports | Different historical codec ID bounds are compatibility contracts, not safe blanket replacements. Existing shared content schema retained. Export-count claims alone do not prove dead code: legacy/test consumers remain. No speculative deletions. |
| JSON tuning | `finisher-data.js` imports, validates and freezes the JSON; it is not a second tuning dataset. No duplicate removed. |
| Weapon generators | Weapon families have different resource/contact/reload semantics. A generator redesign is deferred; corrected resource/selection regression coverage without changing mechanics. |
| Large functions/ownership | Relocated three renderer modules behind the existing engine boundary with unchanged bodies and updated consumers. Frozen policy was not expanded. Broad constructor/function decomposition remains deferred. |
| CI/lint/media | Actions are deliberately disabled; manual gate retained and test workers bounded to two. No new CI service, blanket lint regime or lossy asset transcode. Compression needs visual/audio and device acceptance; no such claim made. |
| Stale documentation/ignore rules | Archived the old PROJECT_STATE unchanged and replaced its active front door with current source/ownership/check pointers. Corrected the misleading flat-GLB ignore rule. |
| Catch-all errors | Narrowed weapon preparation catches to expected loading failure. Preparation already reports a visible error; unexpected execution failures now propagate. |

## Validation record

External immutable receipts are under
`ARMAGEDOM-audit-remediation-evidence-20261021` beside the repository.

- Baseline remote run: 1,558 tests; 1,461 pass / 97 fail (preserved).
- First patched remote gate: 1,575/1,578 pass, 3 assertion failures; packaging and
  production build both exited 0. All product edits are included in that package.
- Remaining assertions concern effect-group identity and flash decay's existing
  per-frame clamp. Tests now compare retained owners and advance normal frames.
- Second full source gate: 1,578/1,579 pass, one later obsolete pale-flash assertion.
  Only that rig test changed afterward; its focused remote rerun passed 2/2,
  EXIT 0. Combined evidence covers all 1,579 current source tests; the last
  full invocation itself remains recorded as EXIT 1, not relabeled green.
  Counts increased because repaired module initialization exposes its individual
  tests instead of reporting a single file-level failure, plus two new regressions.
- Focused effects/Reaper checks: 15/15 pass, including invalid timestep rejection
  for enabled companions and no-op behavior for legacy worlds.
- One self-audit completed: runtime diff and retained negative coverage reviewed;
  all three relocated module bodies byte-identical, historical state archive exact,
  removed duplicate recoverable and hash-identical, no new skip/only tests,
  diff whitespace clean, frozen verification source/test/assets identity matched.
  The final affected-test receipt passed; see `self-audit.json`.

This remediation does not claim every architectural recommendation was implemented.
Deferred items above remain explicit; source checks do not prove browser, physical
Safari/iPhone, performance or publication acceptance.
