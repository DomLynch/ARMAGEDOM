# Ashvault — 2026-10-02

## Objective and scope
Local isometric action RPG: same single room, three waves, melee, dodge, upgrades,
orc warlord and restart. Unity 6000.3.25f1 Built-in renderer; native Mac delivery
at `Builds/Ashvault.app`. No backend or networking. Ten runtime scripts.

## Current delivery
Original Warden hero plus three distinct enemy models: Ash Revenant, Orc Executioner
and Plague Warlock. All three designs appear in wave one; waves contain 5, 6 and 1
foes. Warlord uses the larger orc model. Original 4K PBR textures, CPU rigs and
idle/run/attack clips; original sword, axe and crozier. Geometry stays separate
from gameplay colliders. Existing room preserved; yellow player cone removed.
Closer gameplay camera, subtle cool fill, improved knee bends, continuous four-bone
weights and removal of duplicate hero bounce. Hero turns through 360 degrees.

LMB ground travel/enemy attack; WASD overrides travel; Shift+LMB slash, RMB heavy,
1 shockwave, Space dodge, R restart. V inspects hero, arrows orbit, V restores HUD.
Scroll zoom. Travel stops at obstacles; no global route-finding.

Original reference images and official TRELLIS.2 shared-demo reconstruction;
no purchased assets, paid Jobs or paid GPU compute. Orc/warlock quota overage was
zero before and after generation. Rigging/conversion ran locally on CPU. This is
not CPU-only reconstruction. Sources and receipts: `art/enemies/roster.md`.

## Verified evidence
- 11/11 real PlayMode tests pass: combat, full progression, restart, movement/input,
  first-wave model identity, 4K materials/clips and sampled deformation on all four
  characters. Warden's old 0.3186m underarm extension was fixed; unchanged 0.2m gate.
- Final build `build_f3d1672493fa`: Succeeded, zero errors, 443,151,318 bytes.
  One expected warning: distributed app disables remote Pipeline runtime.
- Native startup smoke passed; assembly SHA256 in `artifacts/player-smoke.json`.
- Final native app displays all three enemy models and 5 hostiles in wave one.
  Movement/dodge, attack cooldowns, incoming damage, death and restart observed.
  Screenshot: `artifacts/roster-native.png`; receipt: `artifacts/roster-native-review.json`.
  App left at safe entrance with 100 HP. This pass's native trials did not verify
  a kill or full clear; automated real PlayMode combat/progression tests did pass.
- Imported idle/action poses visually reviewed; feet world Y approximately zero.
- Ruff, source/doc whitespace and CodeGraph checks pass. Source art and Blender
  rigging workflow retained. Reusable skill: `unity-blender-cpu-art`.
- Earlier research agent and official 2026 sources checked TRELLIS.2, Pixal3D and
  SkinTokens; only TRELLIS.2 used. No verified 2027 release or AAA quality claim.

## Closed failures
Build falsely reported Succeeded with 20,991 TypeDB duplicate errors; rejected.
Fresh Library resolved it. Old cache preserved at
`/tmp/Ashvault-Library-before-roster-clean-20261002`. Restart/CleanBuildCache alone
had failed previously. Explicit zero-error report is the acceptance check.
Old hard region skin weights stretched Warden's underarm: shared continuous weights
fixed it locally, with no regeneration or weakened threshold.

## Remaining acceptance
User judges visual quality. Procedural animation, faces/hands, simple weapons and
world presentation remain below production AAA quality. Enemy micro normals are
albedo-derived, not sculpt bakes. Human difficulty/pacing, sustained combat FPS,
native full clear and Windows remain unverified. No Git remote; local app/commit
are the delivery. Unrelated Blender copies and archived cache left untouched.
