# Ashvault — 2026-10-02

## Current ARMAGEDOM milestone — 2026-10-02
Source sync is configured and verified: Mac main -> public DomLynch/ARMAGEDOM ->
clean /opt/armagedom on VPS. The unprivileged armagedom-sync.timer follows main
without discarding dirt/divergence. Both f672c25 and61a7669 reached all three;
the latter followed automatically. This is source delivery, not a Linux game server.
Unfinished Mac settings and unrelated duplicate art/cache backups remain local.

Editable Westminster pilot now replaces the generated gothic room:11 reusable
mesh assets, saved Resources/London/Area.prefab,45 placed props and42 colliders.
Existing21m footprint, central combat lane, camera, controls, roster and rigs remain.
HUD names ARMAGEDOM/Westminster. Runtime reduced from1009 to955lines/10scripts.
Human vagrant is NOT integrated; original asset identity/reference is unresolved.
This is a modular prototype, well below the supplied reference's visual detail.
Owner approval of art/motion, skyline composition and scene refinement remain open.

Verified after axis correction:18/18 real PlayMode tests, six real-Git sync tests,
independent scoped code/asset review without actionable findings. Native Mac build
build_e2dff2e54325: Succeeded, zero errors, one expected Pipeline warning,
709053567bytes. Packaged startup smoke passes. Native game visibly loads London,
shows ARMAGEDOM/Westminster HUD, starts wave1 on movement and applies incoming
combat damage. Full native clear/sustained FPS are not claimed. Current local
build includes preserved pre-existing untracked Resources copies; these are not
in the source commit. Build-size cleanup is outside this scoped pilot.
Actual engine capture: artifacts/london-pilot.png; build report:
artifacts/london-build-status.json. Two failures were caught and fixed: stale Editor
assembly (explicit refresh/compile), and placement overwriting FBX axis conversion
(compose placement yaw with original asset rotation; flat-road/upright-lamp checks).
The full-run test now checks the London root instead of the removed Throne wall.

Hugging Face CPU Upgrade job6abffcaf404719ba37626627 completed:11 valid meshes,
zero degenerate triangles; source hash recorded in art/london/cloud-validation.json.
First Python3.12 job failed wheel resolution; Python3.13 retry passed. Both terminal,
no rented GPU. Owner prefers HF CPU at$0.03/hour; local Metal allowed as fallback.
Blender authoring/source and Poly Haven texture provenance: art/london/README.md.
Persistent live tuning/content patch delivery remain requested, unimplemented.

Direct user brief sets2029–2030 gameplay. Original2045 narrative remains preserved
unchanged in docs/ARMAGEDOM-WORLD-BRIEF-SOURCE.md. Micro-change decisions are in
ARMAGEDOM/sessions/strategy/DECISIONS.md and docs/ITERATION.md.

## Objective and scope
Local single-room isometric ARPG, three waves, melee, dodge, upgrades and an orc
warlord. Unity 6000.3.25f1 Built-in renderer; native Mac `Builds/Ashvault.app`.
Ten runtime scripts; no backend/networking. No purchased assets or paid cloud GPU.

## Current implementation
One playable Warden plus Revenant, Orc Executioner and Plague Warlock enemy models.
Original 4K PBR maps, CPU rigs, original sword/axe/crozier. First wave shows all
three enemy types; waves contain 5, 6 and 1 foes. London checkpoint now occupies the existing room footprint.
WASD moves, LMB slashes/holds to repeat, Q/RMB heavy, 1 shockwave, Space dodge,
R restart, V inspection, scroll zoom. No click travel. Hero turns through 360 degrees.
Player and enemy attack cones/floor outlines removed; enemy animation signals wind-up.
Hero now uses authored CC0 Sprint motion retargeted onto the original rig, with
distance-driven cadence, blended transitions, bounded acceleration and cosmetic
world-space sole contacts during turns. Mobs now use authored Sprint (Revenant/Warlock)
and Walk (Orc/Warlord), shared transition/contact playback, reverse cadence for
Warlock retreat and gradual facing before strikes. Warlock staff carry clears the floor. Strike damage
lands after anticipation; dodge cancels pending strike damage. Runtime: 955 lines across 10 scripts after the London layout migration.

## Compute
Original reference reconstruction used official TRELLIS.2 shared demo; overage zero.
Initial rigging/conversion local CPU. Previous roster motion bake used authenticated HF Pro
CPU Upgrade, 8 vCPU/32 GB at $0.03/hour, 15-minute limit, private input/output repo.
Job `6abfb00b404719ba37622f1a` completed and all four rigs integrated. Latest
hero retarget used local CPU; no new cloud job or rented GPU.
Unity now operates in persistent local batch mode with Metal, without desktop Editor.
Receipts/reproduction: `art/hero/motion-notes.md`, `art/enemies/roster.md`.

## Prior foundation evidence (historical)
- 15/15 real PlayMode tests pass, including actual deformed sole clearance,
  planted-vertex drift, turns/stops, Warlock retreat/staff clearance, controls and combat.
  Original .2m deformation limit and directional travel thresholds retained.
- Build `build_8274b555f926`: Succeeded, zero errors, 488,065,862 bytes.
  One expected warning: Pipeline remote runtime disabled in packaged app.
- Packaged startup smoke passed. Native startup, movement/dodge, first-wave roster, incoming damage/death and
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
changed. That closure passed the unchanged 11 tests; subsequent suites added new controls/motion checks.
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
GitHub source remote and VPS follower are configured; no game deployment target.
Preserve unrelated Blender copies, old caches,
review captures and TimeManager migration outside scoped commits.

Latest build cache recovery: `build_f6311beefc92` misleadingly said Succeeded with
13,994 TypeDB errors. Verified old Editor process exited, preserved Library under
artifacts/Library-before-motion-retarget, then rebuilt from a fresh cache. Same
build workflow passed with zero errors; full 14-test suite and player smoke also pass.
The first acceleration candidate failed a 135° reversal travel; corrected 48m/s² passes
the same threshold. Retarget wrist and sole defects were corrected and rechecked.

## Latest mob motion closure
Independent CPU judge checked exact original mesh/UV/weights/material/bind preservation
and idle/attack pose preservation. Denser quarter-frame export fixed the large between-key
sole sink. Runtime regression caught an Orc contact target21mm beyond knee reach;
lowering the walking pelvis35mm restored planting without changing skeleton/capsule.
Warlock carry-arm21° correction fixes a new141mm staff-floor penetration; exported
staff minimum+16.47mm across385 samples and runtime clearance/blends now pass.
Existing floor/deformation/controls thresholds retained; walking swing height is
validated separately from sprint lift.15/15 tests plus native smoke/build pass.
Three200-frame game/side captures: artifacts/{revenant,orc,warlock}-authored.mp4.
The reusable unity-blender-cpu-art reference now includes these verified lessons.
Workspace deploy lock cleared before further bakes; no bypass or paid compute.

## Closer camera delivery — 2026-10-02
User selected the first elevated isometric preview and explicitly requested it live.
Default orthographic size is now 4.49075 (another 15% wider than 3.905; originally 5.7), matching the preview angle and
forward framing. Scroll zoom range is 3–8; inspection still restores gameplay view.
Enemy columns are 1.7m apart (was 2.7m), starting at Z=-1 (was 2), with 2.4m
row spacing. Same room, roster, counts and controls; six line replacements, no new components.
User initially checked the original closer framing, then requested this 10% zoom-out.
15/15 PlayMode tests pass; build_faf64ff2eb3a succeeded with zero errors and one
expected Pipeline warning; packaged startup smoke passes. Restarted the native app
onto the new build and observed the closer view during the user's first-wave play/death.
User is checking camera comfort and encounter pacing; no further input sent into their run.

## Zoom-out and slant previews — delivered 2026-10-02
User subsequently requested the 10% zoom-out live, plus preview-only lower angles.
Size3.905 passes all15 PlayMode tests. Four actual-engine stills share identical
staged actors/zoom: artifacts/camera-slant/{00-current-zoom-out,01-subtle-34deg,
02-balanced-30deg,03-lower-26deg}.png. User then selected option2 (30 degrees); it is now applied to gameplay.
First test polling briefly lost Pipeline during domain reload; full gate rerun passes.
Builds461b22abe849 and ba3a3f1f8507 misleadingly report Succeeded with6999 duplicate
TypeDB errors. Restart alone did not fix it. Editor stopped, Library preserved in
artifacts/Library-before-camera-build; fresh import fixed it. Build4b1d1731369c passed with zero errors; packaged smoke passed.
Native app relaunched and the zoom-out verified at the safe entrance. Selected30-degree angle is live; alternatives remain preview-only. No new runtime components/LOC; no remote/cloud deployment.
Two-pass review checked zoom clamp/inspection restore, follow framing and spawn scope.
Post-edit CodeGraph returned fresh HeroView source; cache pollution required direct
RunManager diff review. Existing search context reused for this small numeric edit.

## Selected slant delivery — 2026-10-02
Option2 is the default:30-degree pitch, yaw-32.005, same focus offset as preview,
orthographic size3.905. One camera-offset initializer changed; smooth follow,
scroll zoom and inspection preserved.15/15 tests; build_faf64ff2eb3a succeeded with
zero errors/one expected warning; packaged smoke passed; native app restarted and
30-degree entrance framing observed. Two-pass diff/preview-geometry review completed.
Normal incremental build with DetailedBuildReport completed in3.7s without TypeDB
errors; avoid unnecessary CleanBuildCache for subsequent small camera changes.
CodeGraph query still returned preserved-cache noise; exact scoped diff reviewed.

## Additional zoom-out — 2026-10-02
User requested another15% zoom-out after trying30degrees. Size3.905 x1.15 =4.49075;
angle/follow/spacing/controls unchanged. One numeric edit.15/15 tests passed;
build_8274b555f926 succeeded with zero errors (one expected warning), packaged smoke
passed, app restarted and wider native framing observed. User feel remains subjective.
