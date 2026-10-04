> Historical engine reference only — 2026-10-04: Unity is retired; Game/ and engine commands are privately archived and must not be reactivated. Consult canonical AGENTS.md and briefs/THREEJS-ONLY-RETIREMENT.md for active Three.js work.

# Motion and trackpad controls — 2026-10-02

The user rated the art 6.5/10 and requested natural feet/arms/strikes, WASD travel
and left-click attacks. Preserve the character meshes, textures and existing room.

## Implemented

- `refine_motion.py` opens the existing original rigs with embedded scripts disabled.
  Two-bone leg solving follows a constant-speed stance trajectory and lifted return.
  Hips move in the correct rest-bone coordinate system; soles retain their orientation.
- Each full cycle represents 2.375m. ArtMotion scales playback using actual horizontal
  displacement and character scale; blocked movement stops the run animation.
- Strike has anticipation, contact at normalized phase 0.45, follow-through and recovery.
  Runtime maps this to gameplay wind-up/recovery. Damage no longer lands at button press.
- WASD moves at 4.2m/s. LMB slashes/holds to repeat; Q or RMB performs a heavy attack.
  Clicking never creates a movement destination. Feet remain planted during strikes.
  Dodge cancels both pending damage and the swing animation.

## Compute and receipts

Unity now runs locally in batch mode with Metal available for rendered checks, without
its desktop Editor window. Persistent command pattern is documented in the Unity CLI skill.

Hugging Face Pro account: Domlynch. Private working repository:
`Domlynch/ashvault-motion-work`. Original source rigs uploaded for the authorized job.
CPU Upgrade: 8 vCPU, 32 GB, $0.03/hour; timeout 15 minutes per job. No rented GPU.
First job `6abfafb1404719ba37622edd` failed on missing libXfixes.so.3 before baking.
Retry `6abfb00b404719ba37622f1a` installed Blender's Linux shared-library dependencies,
then baked all four rigs, validated stance trajectories, uploaded outputs and completed.
Downloaded FBXs and Blender source files are the integrated cloud results.
`artifacts/cloud-motion-job.json` and `cloud-motion-validation.json` contain receipts.

Bpy 5.2.2 requires system libraries even for CPU/headless work: libxfixes3, libxi6,
libxrender1, libxkbcommon0, libsm6, libgl1 and libxrandr2. These are shared libraries,
not a rented GPU. Pin Python/bpy versions and cap the job. Keep tokens in secrets.

## Gate failure closure

A stop gate on the preceding build passed 8/11: physical desktop device events/focus
interfered with synthetic mouse/keyboard tests. Isolating enabled desktop devices and
scoping/restoring input focus settings made the original, unchanged behavioral suite
pass 11/11 (`artifacts/input-isolation-pass.json`) before changing input behavior.
An InputTestFixture trial produced package cached-value diagnostics on same-update
press/release; rejected rather than suppressing error logs or loosening assertions.

New tests reflect the explicitly changed controls: rapid click starts a slash without
travel, held slash kills in range without approaching, WASD/diagonal motion remains
bounded, damage waits for contact, dodge cancels pending damage, all four imported
rigs hold stance and clear the swing foot. The existing 0.2m deformation gate remains.
Computing the same maximum across every edge before asserting removes millions of
redundant NUnit calls; it does not skip geometry or change the threshold.
13/13 passed headlessly after the final code change.

## Review checkpoint

Motion build `build_09280800ff7b` succeeded with zero errors; packaged startup smoke
passed. Native HUD, Q cooldown, movement/dodge and first-wave roster observed.
User still finds walking fake: natural-motion acceptance remains open. Tests
establish mechanical contact/timing, not perfect or production-ready animation.
Next gait review must inspect continuous weight transfer and start/stop transitions.

User subsequently requested removal of enemy floor cones. Both wind-up and impact
draw calls are removed, with the death hint updated to refer to enemy wind-up.
The existing timing test retains damage assertions and also rejects floor outlines.
The workspace deployment lock temporarily blocked verification, then allowed it.
13/13 passed with cone-removal assertions. No quality threshold was weakened.
One click test initially measured vertical spawn settling from Y=-0.26 to Y=0.04
as movement, while X/Z stayed fixed. Synchronizing floor colliders and letting the
capsule settle before recording the baseline fixed the fixture; its same 0.03m
three-dimensional movement limit remains. Build `build_1ad04f9ab460` succeeded
with zero errors, standalone smoke passed, and native combat/incoming damage
without enemy outlines was observed. Screenshot: `artifacts/no-cones-native.png`.

## Limits

Foot-bone contact is an automated skeletal check, not proof of perfect deformed-sole
contact in every frame. Animation remains authored/procedural rather than motion capture.
Hands, weapon grip, terrain adaptation and transition polish remain prototype limits.
Human feel/difficulty and sustained native FPS still require a longer play session.
The run pilot image and strike image are Unity render checks, not concept images.

## Primary documentation

- https://docs.unity.com/en-us/engine/6000.3/manual/unity-editor/command-line-arguments/editor
- https://huggingface.co/docs/hub/main/en/jobs-pricing
- https://docs.unity3d.com/Packages/com.unity.inputsystem@1.4/api/UnityEngine.InputSystem.InputSettings.html

## Authored hero locomotion — 2026-10-02

One-hero refinement: pinned Mesh2Motion CC0 Sprint motion retargeted on local CPU
to the original Warden rig, keeping existing idle/attack clips and all enemy clips.
No purchased tools or new cloud GPU job. Existing HF Pro CPU workflow remains
available; this small retarget bake completed locally. Source/license and tool
decisions: `art/reference-motion/README.md`, `art/tooling-review.md`.

1. Base gait: world/anatomical bone mapping, consistent wrist alignment, original
   mesh/weights/rest matrices verified unchanged. Actual weighted boot geometry
   corrected to ground during bake. Independent sampled minimum Z=-0.000005264m,
   wrist angles14.36°/22.61°, zero joint gaps. Original .2m deformation test passes.
2. Transitions: distance-driven cycle, weighted idle/run/strike blending and bounded
   travel acceleration/deceleration. Initial26m/s² response drifted too far on the
   test's135° reversal;48m/s² passes the unchanged directional travel threshold.
3. Contacts: runtime cosmetic two-bone solve caches actual boot geometry, grounds
   soles through blends and holds contact points during turns. Releases for dodge
   or unreachable contact. Controller collision/damage remain independent.
4. Review: `MotionReview.Start(label)` records200frames of identical synthetic
   real-input idle/travel/stop/restart/right-turn/reverse/stop at30fps. Outputs
   side/game views and world-foot CSV under `artifacts/locomotion-{label}`.

All14 PlayMode checks pass. A new live deformed-boot test replaces the hero-only
flat-ankle assumption (heel/toe roll moves the ankle during contact); the original
flat-stance test remains unchanged for all three enemies. New test selects the
body by its verified model name, because the sword also carries the full bone list.
Naturalness remains a visual/user acceptance question; tests do not establish AAA.

Final build `build_50200eeef63c` has zero errors and startup smoke passes. The prior
TypeDB cache failure is retained in `artifacts/motion-build-cache-failure.json`;
a verified Editor exit and fresh Library cleared it. Final14/14 suite also passed
after rebuilding. Native startup, dodge/input, first wave and restart checked; app
left at the entrance. Independent before/after still review found clearer running
silhouette and no new obvious deformation; complete cadence/user feel remains
for re-check. CodeGraph post-edit MCP refresh timed out; explicit CLI sync retry
succeeded (already up to date). Actual source review and gates cover changed paths.

## Mob continuation — 2026-10-02 (delivered for user review)

Scope: reuse authored motion on Revenant/Orc/Warlock, keep original mesh/rig/materials
and existing strike timing. Candidates considered: retune old procedural gait; reuse
pinned authored clips; migrate to a new Animator/retarget package. Reuse wins on
visual value, reversibility and dependency/LOC cost. Revenant/Warlock use Sprint,
Orc uses Walk at a measured ~1.31m/cycle. Warlock preserves its staff-arm carry pose.
Shared cosmetic playback replaces duplicated enemy/hero paths; enemy gameplay
turning is bounded and waits to face the target before starting a strike.

Independent judge found between-key sole penetration in the 25-key Revenant bake
(24.4mm) despite clean integer keys. Quarter-frame baking/export resolves sampled
FBX penetration to less than 0.001mm. Original topology/weights/UVs/bind matrices
and idle/attack poses match the source. Runtime sole/turn/stop tests and continuous
game-camera recordings remain pending; static asset checks are not acceptance.
New gradual-turn test reproduced the old 180-degree single-frame snap before the fix.

Workspace deploy lock f6d0a95 temporarily holds bakes/builds/game checks as of16:04UTC.
No lock bypass, paid tools/GPU, remote inference or new cloud job. CodeGraph
returned cache symbols for some exact queries; direct known-file reads filled gaps.

Final verification:15/15 real PlayMode tests pass; build_3c18afcd4b69 succeeded
with0errors/1expected Pipeline warning,488065862bytes. Native startup smoke passes;
movement/dodge, first-wave three-model roster, incoming damage/death and restart
observed. Three200-frame game/side recordings saved under locomotion-*-authored.

Failure closures: Orc planted target exceeded leg reach by21.234mm at phase.2306,
causing36.191mm world-sole drift. A35mm lower walking pelvis leaves knee extension;
the same35mm/frame drift limit now passes including turns and Warlock backward
travel. Warlock staff regression (-141.15mm) fixed by a Run-only21° upper-arm local-X
carry correction; independent385-sample FBX minimum+16.467mm, wrist/grip unchanged.
Runtime staff-floor clearance test also passes. Minor between-key sole error in
dense independent samples remains below5mm and is handled by runtime grounding.
No new components/packages:1009runtime lines,17fewer than before.

Search/impact receipt: three Semble searches and CodeGraph source/impact used before
edits; cache symbols polluted some queries, so known-file reads filled those gaps.
Post-edit CodeGraph returned updated ArtMotion/EnemyController callers without a
staleness banner. No remote/deploy target; native app is the delivery.
