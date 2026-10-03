# ARMAGEDOM — 2026-10-03

## Owner priority — first playable loop, 2026-10-03
Owner considers centre, south and east sufficient and approved focusing on a small
combat roster, a loot/equipment/save loop, then a polished first session before
expanding content. Milestone1 allocation is saved in briefs/FIRST-PLAYABLE-LOOP.md
and dispatched within the existing five lanes; no additional permanent lane.
World finishes the current bounded south paths and releases Unity; Lead then
reviews one short existing Westminster mixed fight. Character review remains
separate; delivery follows the accepted demo. Boss follows ordinary-combat acceptance.
These are next milestones, not completed systems. Preserve the current bounded
south-path acceptance and character review; no new region, LLM or backend work.

Prior Lead combat candidate: real keyboard reproduction showed a quick Q in
late slash recovery was discarded. Added one fresh attack buffer in the final120ms
of recovery, preserving press-time aim/cooldowns and existing attack timings.
Early taps remain discarded; dodge/disable clear queued intent; a fresh eligible
selected command supersedes an older queue. Final38/38 PlayMode and6/6sync pass;
build_fbe77483fe4a Succeeded, zero errors/one expected warning; packaged smoke passes.
Native shows the current survivor/five mixed enemies, incoming damage, dodge and
heavy cooldown activation; R returns to Westminster100HP/Wave0, left open for Dom.
Short native captures do not establish continuous motion/full clear, native death
retry or shockwave activation. Dom combat-feel/character acceptance remains open.
Pre-combat app preserved as Builds/Before-combat-buffer-20261003.app; exact source/
content hashes, native limits and receipts in artifacts/combat-review/receipt.json.
World's all-three-area walkability audit is saved and targeted movement checks pass;
Lead owns its combined full gate with the next sword change; native path review remains open.

Latest owner combat direction: Dom finds the buffer-only change negligible and
requests two normal attacks (sword slash/stab), heavy, special, dodge and guard/
block/parry, with action roles reusable for later weapon types. Strategy records
the amendment in FIRST-PLAYABLE-LOOP.md. Dom subsequently approved one adaptable
survivor with equipment-led specialisations and sword acceptance followed by one
basic gun proof. Four separate rosters/classes remain outside scope. Lead took
World's offered release after its three audit movement sweeps; sword source now
adds distinct thrust/heavy/guard poses, finite frontal block and timed eligible
parry through small weapon/defence definitions. Five missing-mechanic failures
and the shared slash/thrust pose failure were reproduced before repairs; six
new targets pass. Independent scoped code review found no actionable defects.
Combined full gate/build/native are pending; the running app still has the prior
buffer candidate until rebuilt. Earlier38/38 does not prove the new actions.
World's latest Diablo-style size/follow and east solid-overlap feedback is a
separate pending checkpoint; World prepares outside loaded Game during this gate.

## Connected London pilot — 2026-10-03
Owner confirmed native walking across the Westminster bridge into supplied east
image. Build_53178edfc779:29/29 tests, zero build errors; accepted east app retained
as Builds/Accepted-east-bridge-20261003.app. Owner then requested south/down.
Same bounded travel path now adds original south image and north return, preserving
player, controls, fixed camera, zoom1.65, scale1.265 and existing crop follow.
Final31/31 real PlayMode and6/6 sync pass, including real-input east/south roundtrips
and R restart in both away areas. Scoped duplicate TypeDB metadata preservation
fixed the build: build_338fb3a4be8c Succeeded with zero errors/one warning;
packaged startup smoke passes. Native log records south→west; owner now supplies
south screenshots and requests an additional highlighted walkable area.
World owns this small saved south layout/collision refinement. Native automated
physical-hold roundtrip remains unproven; prior east owner acceptance retained.
Candidate images remain byte-identical; accepted east build is preserved.

This pilot uses a visible image switch at exits. East/south are exploration lanes;
Westminster enemies and wave updates park while away and resume on return. Original
normal launch and pre-bridge app remain rollback. Opt-in local launcher:
Builds/Play-London-pilot.command. South roof/generation/panorama work is deferred.
Receipt: artifacts/london-travel-receipt.json. Native ready screenshot retained.
Owner native screenshots establish south play. Latest marks add north-left
pavement and the lane connecting both sides of the checkpoint. Saved34point outer
road reaches y.02; two optional blocker polygons preserve wreck/supplies and gate
barrel/crate collision. Road rays must hit ground forward inside the existing200m
floor; unchanged mask coordinate limits retained. Extended full keyboard route
passes71.71s: ascent/descent, both left-lane directions, prior crossings, checkpoint
collision and north return. Unsafe shallow-camera layout preserves last-good state.
Full32/32 PlayMode and6/6sync pass. Build_f3ad34225b42 Succeeded0errors/1warning
in3729ms; packaged smoke passes. Updated opt-in native client open, visually
Westminster Wave0/100HP; south-loop owner review remains next. Future saved road/
blocker edits reload on area re-entry. Previous app/layout preserved for rollback.
World releases sequential Editor. Receipt: artifacts/london-travel-receipt.json.
Owner then marks tight gate-barrel/wreck gap. Only two saved blocker footprints
tightened; outer road/masks/settings unchanged. Exact real-keyboard gap test
passes1/1 in14.26s, both directions with checkpoint still physically blocked.
No additional World build; south re-entry loads content. Lead owns next combined
full gate/build for combat; owner gap review remains next.
Two7018-error builds were held; scoped duplicate TypeDb-All 2.json recovery
preserves metadata outside Library and produces a clean1154ms build.

Owner-requested all-three-area walkability audit is now activated as saved content:
26 surveyed street/pavement locations connected, 20 previously outside/blocked.
Real-keyboard Westminster54.87s/east59.09s/south60.14s sweeps pass, including six
physical prop/river exclusions. South northern blocker clipped to validy.205;
existing runtime limits preserved. Artwork/masks/camera/scale/combat unchanged;
no World rebuild. Source hashes match tested candidates;6/6sync passed. Previous
layouts retained under art/london/areas/walkability-audit-20261003/before.
Native WestminsterWave0/100HP visible; new-path owner review requires R or area
re-entry. Lead explicitly took Unity for ONE combined sword/world full gate;
no duplicate41test World run. Receipt artifacts/walkability-audit-receipt.json;
coverage/limits docs/LONDON-WALKABILITY-AUDIT.md. No all41/full native travel claim.

## Story and AI direction recorded — 2026-10-03
Owner approved incorporating adaptive zone intelligences and competing military-AI
escalation into briefs/MAIN-STRATEGY-DEV.md. Owner subsequently removed EDEN:
surviving AI factions, their conflicting agendas and consequences for human
communities now form the main story, without a central restoration system.
War and gameplay both remain2029–2030; collapse unfolds over weeks/months.
Original2045 source remains historical and unchanged. WARDEN is a future Westminster
boss concept, distinct from the legacy hero asset. Deterministic combat executes
validated tactics; an optional future LLM layer supplies bounded strategy/dialogue
with encounter memory and fallback. This is design-only, not implemented or deployed.
One future boss experiment follows current character/world priorities; no new
runtime, backend, provider, purchases or compute authorized by this brief update.

## Additional readability tuning — 2026-10-03
Owner requested another10% actor size and10% scene zoom: characterScale1.265,
zoom1.65, about21% combined apparent enlargement. Saved settings updated; former
native size cap1.25 raised to1.5. Updated development player is live and left at the safe entrance for owner playtest.
The contact failure was double application of BakeMesh renderer scale, confirmed
by equal world bone poses with false45mm vertex drift and Unity Digital Human's
TRS(position,rotation,Vector3.one) conversion. Production boot cache and test world
measurements corrected; sole selection now uses worldY. Original35mm skate/25mm
penetration limits preserved. Target contact regression passes. All experimental
IK/shin/hip/cadence changes removed; original rigs, assets and gameplay retained.
Full20/20 PlayMode suite passes; six sync tests pass. Development build6e9b39d24885
Succeeded, zero errors, one expected Pipeline warning; packaged smoke passes.
Native original London/hero/HUD and five first-wave mobs visibly checked, then reset.
Full native clear is not claimed. Native launch initially blocked in macOS file open;
relaunch through the workspace runner reached clean startup/render. Receipt:
artifacts/readability-receipt.json. No paid compute/cloud job used.

## Canonical workspace migration — 2026-10-03
Owner requested the full game move into ARMAGEDOM. Canonical root is now
/Users/domininclynch/Desktop/Business/ARMAGEDOM; Game/, Builds/, art/, Git history,
all caches and unrelated local work were moved together on the same filesystem.
Original top-level directory inodes and critical file hashes were verified after
rename. Planning folders are merged here; overlapping old planning documents are
preserved under handovers/pre-migration-planning-20261003/. Old Ashvault directory
was removed only after emptying it by rename. Internal app/scene/assembly names
remain unchanged; no runtime code or game build is required for this move.
Updated strategy brief, README, developer handover, sync path and Codex routing.
Verified from the new path: 20/20 PlayMode tests, six sync tests and packaged
startup smoke pass. Native app visibly loads the London image, hero and HUD;
LONDON_CONTENT resolves to ARMAGEDOM/Game/Assets/StreamingAssets/London.
Existing build, saved content and both pre-existing dirty settings retain identical
SHA256 hashes. No rebuild. Unity Hub registration and workspace quality-gate paths
updated. Migration preservation receipt: artifacts/workspace-migration.json.

## Readability update — 2026-10-03
Owner-requested1.5x zoom,15% cosmetic actor enlargement, .45s edge-clamped scrolling,
and brighter key/cool fill are implemented. Saved layout.json now exposes zoom,
characterScale, followSeconds and fillIntensity. Projection cropping keeps the image,
depth masks and actors registered without changing camera angle/position or collision.
The native updated app was opened and visibly shows the enlarged view/hero for owner
playtest. Full native movement/clear is not claimed; automated movement checks pass.

Final20/20 PlayMode tests pass; six sync tests pass; scoped reviewer closed findings.
Build58f0075bf14e Succeeded with zero errors and one expected warning. Packaged smoke
passed. Scaling exposed existing planted-foot rotation drift during turns; pinning
foot world rotation during contact fixed the original unchanged skate assertion.
Enlarged staff carry needed a two-bone arm adjustment preserving bone lengths and
hand orientation, faded out during strikes. Whole-body lift was rejected because
it caused idle feet to hover. Original deformation/ground/skate thresholds unchanged.
A local name-shadow compilation error was corrected before the successful full suite.
Unity needed a persistent detached restart during testing. No cloud/GPU job used.
Semble three targeted searches and CodeGraph scoped LondonBackdrop inspection used;
source/build/tests are current; graph semantic freshness is not a test receipt.

## London image stage — 2026-10-02
Owner rejected the basic 3D blockout and approved the original Westminster image
with 3D actors. Implemented fixed perspective, invisible road/boundary collision,
three authored convex depth masks and contact shadows. Original image is byte-identical;
old London prefab/assets retained for rollback. Knight/roster remain; vagrant unresolved.
Development builds beside the checkout reload saved StreamingAssets/London files
once per second. Camera calibration, exposure, key light, road/masks and same-aspect
image replacements are supported. Gameplay free orbit/scroll zoom disabled; V inspection
restores the fixed view. Painted buildings are not individually movable assets.
See docs/LONDON-BACKDROP.md for file contract and explicit startup/reload limits.

Final verification:19/19 real PlayMode tests, six real Git sync tests, independent
scoped review closed. Regression coverage includes live saved-file reload, restart
persistence, invalid paired-image rejection, future-spawn safety, valid notched roads
and native mesh cleanup. Build build_d0e9befb3676 Succeeded, zero errors, one warning,
711979696bytes. Packaged startup smoke passed. Native Mac app visibly shows the
original image, 3D hero and correct HUD at safe entrance; opened for owner playtest.
Editor combat render checked; full native clear and sustained FPS not claimed.
Runtime1181lines/11scripts. No cloud jobs or paid compute used. Source sync receipt
is recorded in Codex coordination notes after promotion. Unrelated local dirt preserved.
CodeGraph returned cache-polluted results; Semble discovery plus direct scoped source
reads used. Runtime/test source verified after explicit Editor refresh; graph index
freshness is not a verification claim.

## Previous editable pilot (superseded visually)
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
sessions/strategy/DECISIONS.md and docs/ITERATION.md.

## Objective and scope
Local single-room isometric ARPG, three waves, melee, dodge, upgrades and an orc
warlord. Unity 6000.3.25f1 Built-in renderer; native Mac `Builds/Ashvault.app`.
Eleven runtime scripts; no backend/networking. No purchased assets or paid cloud GPU.

## Current implementation
One playable Warden plus Revenant, Orc Executioner and Plague Warlock enemy models.
Original 4K PBR maps, CPU rigs, original sword/axe/crozier. First wave shows all
three enemy types; waves contain 5, 6 and 1 foes. London checkpoint now occupies the existing room footprint.
WASD moves, LMB slashes/holds to repeat, Q/RMB heavy, 1 shockwave, Space dodge,
R restart, V inspection. Saved zoom with fixed-angle, edge-clamped scrolling.
No click travel. Hero turns through 360 degrees.
Player and enemy attack cones/floor outlines removed; enemy animation signals wind-up.
Hero now uses authored CC0 Sprint motion retargeted onto the original rig, with
distance-driven cadence, blended transitions, bounded acceleration and cosmetic
world-space sole contacts during turns. Mobs now use authored Sprint (Revenant/Warlock)
and Walk (Orc/Warlord), shared transition/contact playback, reverse cadence for
Warlock retreat and gradual facing before strikes. Warlock staff carry clears the floor. Strike damage
lands after anticipation; dodge cancels pending strike damage. Runtime remains split across 11 scripts, including the London image stage.

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

## Human Vagrant pilot — ready for art review 2026-10-03
Owner authorized modular civilian art for London2029–2030 using bounded HF
cpu-upgrade32GB at$0.03/hour, no GPU. First pilot is active in the local native
build: worn jacket/trousers/boots/pouch and short machete. Eight separate meshes;
optional vest/backpack start disabled and toggle on the shared original19bone rig.
Original Idle/Run/Attack clip assets, gameplay collider, scale1.265, London camera
and Warden rollback retained; original Hero/Enemies assets untouched.

Final FBXc5767fcf...c5087d matches runtime import, HF output6fd96e05...;19bone/rest/
action and head-volume checks pass. Final26/26 PlayMode and6/6 sync pass.
Build_58b2a8b41f4b: zero errors, one expected Pipeline warning, startup smoke PASS.
Native movement/dodge/attacks observed; alive Wave1 capture shows4hostiles,56HP,
shockwave cooldown. App reset to safe Wave0/100HP. Ten isolated and12 staged
London pose views reviewed at unchanged camera/scale; those stills complement
brief native input checks, not completed-wave or physical-phone acceptance.
Evidence: art/vagrant/review/acceptance.json and native-final-*.png.

Functional pilot only: face/hair, hand grip/fingers, fabric wear/seams, boots and
gear detail need polish; vest-front silhouette is subtle. Existing inspection
near enemies can be occluded; reset first. No inventory/stat expansion, outfit
batch, commit or published survivor release. All character cloud jobs terminal.
Character Unity checkpoint finished; shared Editor slot released to next lane.
Next: owner reviews silhouette/clothing/weapon direction before the art polish pass.

## Human Vagrant polish — local review, art acceptance held 2026-10-03
Owner-approved first detail pass is imported in the local review build. Separate
source/output and rollback-runtime preserve the frozen pilot; knight untouched.
Final FBXb7537dca...e6cb9, HF outputbda3e2b5..., CPU-only. Eight meshes,36924triangles.
Original19bone/rest/actions remain exact; original Unity clip assets reused.
Closed grip, blade bevel, fitted knee patch, collar/zipper/stitches, boot laces/welt,
pouch/gear fasteners and explicit albedo/normal atlases. Misplaced brow/eye patches
removed after visual rejection. Camera/FOV42/scale1.265 and gameplay preserved.

Actual final unfiltered gate27/28: all4Vagrant pass; World's real-keyboard route
fails at first waypoint. Sync6/6. Build_3e66f238bb5f:0errors/1expected warning;
packaged startup smoke PASS. Native inspection and short input review captured;
first longer combat capture ends in death, not completed-wave evidence. Twelve
staged London poses complement native review. App restored to safe entrance.
Receipts: art/vagrant/polish/review/acceptance.json and full-playmode-results.json.

Art acceptance remains held: pinch folds/bulky fingers/projecting thumb, jagged
hairline, moving zipper/collar and basic procedural wear. Local4mm smoothing trial
worsened hand folds and was rejected; not imported. No AAA or global-green release
claim, no publication/commit. All character cloud jobs terminal. Shared Editor
explicitly released08:50Z to World; no further Char Editor mutation/build queued.
Owner suggested Tripo H3.1 replacement base; official capability/cost research
supports testing one reference-driven candidate. No Tripo job or purchase run.
Next: World closes keyboard fixture and reruns full gate; character lane can
prepare a reference/morphology pilot with separate clothing/gear and original rig.
