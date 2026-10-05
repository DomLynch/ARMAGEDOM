# Normal-speed finisher art component — 2026-10-05

Base040 `0ab3aaa8a256d9cd50145995a8405b0d135a41db`.
NEW runtime `Web/src/finisher-presentation.js`10683B, SHA256
`78553b8a4712e8f2e7e5efcf66d217fa5f08323aa19162cd9418376cdd888fe1`.
NEW focused tests SHA256 `3f0443b449851ba1a84a195d1e3b014ff62104ec695d287195198d6828ac9486`.
Existing actors/donor-motion/face files, player, rig GLBs, clips, loot and saves unchanged.
Source repaired Hollow352533ecf93234b23a69752b266b134eee387c35e5fc87ea0c2230085fa4f1ff.
Read-only Frankendom HEAD303af39e97b758f50a84935eeb0cac6196fe98ae verified.
Original donor sever() bakes vertices at kill time and scales Head: neither copied.
No duel/single-opponent/attacker hold/0.75clock machinery imported.

## Concrete recipes

Actual equipped20pose/4clip inspection6.01sEXIT0/8inputs viewed. QuietOne clutches
throat; RunThrough holds impalement: not generic bullet deaths. First delivery:

- ordinary: Death,2.4000000953674316s,cost0,parts[].
- pistol-directional: native Hit .3333333432674408s THEN Death2.4000000953674316s;
  total2.7333334386348724s,cost0,parts[],prepared independent of head budget/prep.
  Native clips each1x, actual impact-direction recoil <=.1m then zero. No inferred
  hit region/cut/impale. Record clip='Death',reactionClip='Hit',reactionSeconds.
- decapitation: native Death_SplitCrown1s,cost1,parts=['head'],prepared only for
  supported current Hollow head and supplied registered-world collision callback.
  One detached head, actual appearance, small opaque caps, maximum6s or actor
  teardown sooner. Cutting only. All unsupported/unknown/unready paths ordinary.

Combat selector50675b0 IDs/impactDirection/cost0 no-part bullet/cost1 head align.
Future split-crown/opened/run-through anatomy recipes are not prepared/shipped by
this component. This death clip is used solely as the decapitated body's collapse.

## API and sole WebUI integration

`createFinisherPresentation({root,model,clips,scene,groundY:0,isBlocked,isPlayer,
prepareHead:true,maxVertices:24000})` returns support/start/pose/update/stats/dispose.
Create once at NPC birth AFTER private actor material cloning, selected face+hair
application, and native motion initialization. Do not prepare a corpse first seen
already dead on its lethal frame: use prepareHead:false/ordinary fallback.

For independently ready pistol delivery pass prepareHead:false: no static head
geometry/material buffers, cutting unsupported, pistol still supported at budget0.
Player pass isPlayer:true: no recipes/head preparation. Native Death clip required.

support records expose actual per-actor clip durations, prepared flag, parts and
cost. Selector produces confirmed per-corpse outcome. `start(outcome)` consumes
recipeId/damageType/impactDirection once (duplicate calls return existing recipe).
Bullet cannot detach head even if given decapitation ID. Do not select recipes by
inventing a hit region or merely checking a donor clip name.

For each dead actor: reset root to entity world position/facing, call pose(elapsed
since confirmed death), sample returned clip/phase at1x through native motion,
and add its small ARM-coordinate offset as presentation only. Do not divide the
composite pistol duration by the Death clip or leave DonorMotion's unconditional
ordinary dead branch as the only sampler. No authoritative position/save mutation.
Update(elapsed,dt) steps the part at most six times per frame using full elapsed
time (not a0.1s clamp that slows debris on low frame rate). No shared/global clock,
player pose or victim invulnerability. Normal death removal/rewards remain owned
by existing engine. Ensure current corpse lifetime accommodates native sequence.

Pass `isBlocked(point,radius,from)` in ARM x/z coordinates, e.g.
`!world.geometry.clear(point,radius) || (from && !world.geometry.lineClear(from,point))`.
Pistol offset calls without from; part steps include from for swept wall checks.
Default render scene must be the normal identity-transform Scene; groundY actual
registered floor0. No xray/render-order/bloom/lights/textures/physics framework.

## Appearance and resource contract

Preparation borrows actual selected Photo/PhotoEyes/PhotoTeeth and optional named
Scavenger hair; snapshots their UVs/vertex weathering and transforms into new owned
static buffers and private material clones. Maps/skeletons/face cache/original
materials and geometry stay borrowed. No API changes to041 face kit required.
Current head capability requires repaired lower neck and all three visible head
meshes, <=24000 input vertices, valid neck rim. Per actor7605–8851 prepared vertices,
4–5 geometries/materials including shared opaque cap, selected face/hair dependent.
All original cloth/palette remains untouched. No whole50-face prerequisite.

Refresh SkinnedMesh bindMatrixInverse with updateMatrixWorld before preparation;
updateWorldMatrix alone omits that override. Detach retains exact affine matrix
rather than losing original bone scale/shear through decomposition. Head local
buffers and materials already prepared; start copies/transforms objects only,
zero lethal vertex copies, measured cut start~.4ms in this VPS fixture (not phone).

Dispose presentation BEFORE face handle, actor-owned materials/skeletons and
source/face kit. Restores hidden nodes, removes head/stump and frees only owned
snapshot buffers/materials once. Six-second expiry removes head; actor cleanup
releases buffers early. Never place these owned materials in a second disposer.

## Evidence and honest limits

Final VPS input-86d45faa2e62/20hash-bound inputs/28.02sEXIT0, recovered proof/.
Runtime module hash matches actual receipt. Source module unchanged after final
render. Remote original two focused tests PASS; local final three tests PASS on
Three0.182.0; new real-bind synthetic ownership test detects stale-bind regression
and0.1s clock-clamp mutation. regression-check.json records both failures caught.
A first local third-test fixture used a nonexistent Skeleton event API; corrected
to observing dispose() without any product change (2PASS/1fixtureFAIL→3PASS).

Actual repaired rig/selected narrow-messy-light85% and broad-crest-deep115% at006
camera1.3365 plus ordinary100%. Final launch vertex-world comparison maximum
3.23585689692933e-8m. Own current colour/map/vertexColours and source geometry/material
identity assertions PASS; source unchanged, independent corpses, normal1x native
sample times. Fresh portrait.15/.5/1.5 and landscape.5 images viewed; part correctly
leaves current neck and reaches ground. Final video clock6.6452s/18rendered frames;
CPU Chromium capture is sparse, not frame-pacing/FPS/phone acceptance. Native clocks
follow elapsed time rather than a stretched snapshot film. Video retained locally.

Three corpse art fixture44draws/142994tri at sampled early poses. Actual base source
plus two hair styles is42draws/142898tri; decap replacing attached head with same
snapshot plus two48tri caps adds2draws/96tri. Pistol adds0draws/geometry. After six
seconds part removed; corpse remains headless until normal actor removal. Cleanup
16geometry37borrowed textures/source identity PASS, not complete source-library
GPU release or warm-repeat claim. No blood textures/trails/fragments beyond one head.

Preserved intermediate stages: input-af6c9db6350a163.06sEXIT0 wrapper but head art
FAIL (double actor transform) and sparse serialized snapshot video unsuitable
normal-speed evidence. input-54a4f84b4ae319.02sEXIT0 corrected launch3.24e-8m and native
clock, but old0.1s debris clamp and post-expiry still screenshots not final proof.
Final full-elapsed bounded motion/fresh state fixes those capture/lifecycle limits.
Inspection/pistol/native clips reused; no new clip sheet or face batch.

This is isolated presentation component readiness, not actual combat integration,
new kill issuance/reward/persistence/player-continuing/survivor fight proof. WebUI
and Lead own frozen integration gate, real pistol/melee kills, simultaneous deaths,
continued player/survivor actions, exactly-once rewards/cleanup/Retry and publication.
Physical-phone feel stays separate. Do not merge the starting baseline wholesale.
