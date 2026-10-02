# Ashvault — 2026-10-02

## Objective and scope
Local single-room isometric ARPG, three waves, melee, dodge, upgrades and an orc
warlord. Unity 6000.3.25f1 Built-in renderer; native Mac `Builds/Ashvault.app`.
Ten runtime scripts; no backend/networking. No purchased assets or paid cloud GPU.

## Current implementation
One playable Warden plus Revenant, Orc Executioner and Plague Warlock enemy models.
Original 4K PBR maps, CPU rigs, original sword/axe/crozier. First wave shows all
three enemy types; waves contain 5, 6 and 1 foes. Existing room preserved.
WASD moves, LMB slashes/holds to repeat, Q/RMB heavy, 1 shockwave, Space dodge,
R restart, V inspection, scroll zoom. No click travel. Hero turns through 360 degrees.
Player and enemy attack cones/floor outlines removed; enemy animation signals wind-up.
Hero now uses authored CC0 Sprint motion retargeted onto the original rig, with
distance-driven cadence, blended transitions, bounded acceleration and cosmetic
world-space sole contacts during turns. Enemy clips are unchanged. Strike damage
lands after anticipation; dodge cancels pending strike damage. Runtime: 1,026 lines across 10 scripts.

## Compute
Original reference reconstruction used official TRELLIS.2 shared demo; overage zero.
Initial rigging/conversion local CPU. Previous roster motion bake used authenticated HF Pro
CPU Upgrade, 8 vCPU/32 GB at $0.03/hour, 15-minute limit, private input/output repo.
Job `6abfb00b404719ba37622f1a` completed and all four rigs integrated. Latest
hero retarget used local CPU; no new cloud job or rented GPU.
Unity now operates in persistent local batch mode with Metal, without desktop Editor.
Receipts/reproduction: `art/hero/motion-notes.md`, `art/enemies/roster.md`.

## Verified evidence
- 14/14 real PlayMode tests pass after final clean-cache build, including actual
  deformed boot floor clearance during movement/turns, controls, combat and restart.
  Original .2m deformation limit and directional travel thresholds retained.
- Build `build_50200eeef63c`: Succeeded, zero errors, 487,613,862 bytes.
  One expected warning: Pipeline remote runtime disabled in packaged app.
- Packaged startup smoke passed. Native startup, input/dodge, first-wave roster and
  restart visibly checked. App left at the safe entrance for user review.
- Identical 200-frame before/after real-input side/game-camera recordings:
  `artifacts/locomotion-before.mp4`, `artifacts/locomotion-after.mp4`.
  Independent still review sees clearer running silhouette and grounded stopped pose;
  continuous cadence and user game-feel acceptance remain separate.
- Agent verified original mesh/weights/rest matrices unchanged, corrected wrists and
  sampled baked sole minimum -0.000005264m. Hero geometry/textures remain original.
- Tool review: `art/tooling-review.md`. CC0 animation reference is pinned and reproducible.
  Added original `blender-procedural-assets` Codex skill with fixture-tested mesh checker;
  updated `unity-blender-cpu-art` with shader and retarget checks. Both validate.
  Snyk skill decision record: `art/snyk-skill-review.md`.

## Closed failures
Previous 8/11 input tests failed with physical desktop/focus interference. Scoped
input-device/focus isolation passed the original unchanged 11 tests before controls
changed. Latest suite has 13 tests; no thresholds relaxed.
A later click test measured vertical spawn settling (-0.26 to +0.04 Y) as travel;
X/Z unchanged. Syncing colliders and settling the capsule before recording the input
baseline fixed the fixture; same 0.03m 3D limit remains and full 13/13 suite passed.
HF first motion job lacked libXfixes; dependency-installed retry completed the same
bake/validate/upload workflow. Earlier duplicate TypeDB build errors were fixed by a
fresh Library; always check error count even when build says Succeeded.
Workspace deployment lock briefly blocked tests; it subsequently allowed the full suite/build.

## Open acceptance
User reports walking still looks fake. Natural motion is NOT accepted as complete:
review continuous weight transfer, hips/shoulders and start-stop transitions next.
Passing mechanics tests is not proof of natural animation or AAA quality.
Hands/grip, simple weapons, facial detail and world presentation remain prototype
limits. Native full clear, human difficulty/pacing, sustained FPS and Windows unverified.
No Git remote/deployment target. Preserve unrelated Blender copies, old caches,
review captures and TimeManager migration outside scoped commits.

Latest build cache recovery: `build_f6311beefc92` misleadingly said Succeeded with
13,994 TypeDB errors. Verified old Editor process exited, preserved Library under
artifacts/Library-before-motion-retarget, then rebuilt from a fresh cache. Same
build workflow passed with zero errors; full 14-test suite and player smoke also pass.
The first acceleration candidate failed a 135° reversal travel; corrected 48m/s² passes
the same threshold. Retarget wrist and sole defects were corrected and rechecked.
