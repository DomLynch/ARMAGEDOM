# Ground pickup halo — Characters follow-up, 2026-10-05

Exact accepted041 base `1dd5e841212125a9a62a64cdfdfddf61f26d5659`.
ONLY runtime change `Web/src/pickup-glow.js`,2302B, SHA256
`b95d7780a8b658a2fdcb7c87ed173cadb1f795d188378c6ccdfeb3c3dfdcd691`.
Updated focused tests2343B/SHA75a7cad2ff185c44b5cf8fd59e286bd502f38f3bef60713e3d8757135a2563a2.
Existing supplies-view/vest-view/donor-motion verified byte-identical to041.
Finisher2750ea7, face, camera, loot/save/eligibility/collection, player/equipped cloth
and current042 integration untouched. WebUI alone integrates after that checkpoint.

## Why and chosen design

Dom reference screenshot shows the tiny rounds exist beside a prone corpse, but
surface emissive colour has no readable exterior glow. Screenshot device/served
revision is not established here. Prior040 collection/save receipts remain valid
for unchanged logic; they never established physical-phone glow readability.

Compared two bounded geometry approaches under actual006 camera and native Hollow
Death corpse: smoothed two-layer inverted silhouette shell versus local soft halo.
Shell outlines packet/vest edges, but thin cartridge/corpse visibility remains weak;
18extra draws/648triangles across five test items and nine cloned primitive buffers.
Soft halo is more conspicuous and uses9extra draws/30triangles/one shared unit quad.
Chosen halo leaves original material/geometry/maps/instances unchanged instead of
painting all surfaces orange. Ring centre is transparent, outer edge fades; final
opacity0.60/opening.38–.62/outerfade.66–1.00 and6cm height offset preserve item detail.
World radius max(.19,source-largest-axis*.5*model-scale+.11), actual .19–.29m here.
Constant warm orange0xff7b12, normal alpha blending and ordinary wall depth.
One quad per actual cartridge case/tip instance; pairs can overlap as one local cue.
No fullscreen bloom/OutlinePass/render order/renderer/lights/textures/dependencies.

## Interface and disposal

Same existing API `addPickupGlow(mesh)->{halo,dispose()}`. Existing view calls and
handle disposal order remain valid; no view/runtime edits needed for this helper.
Accepts unskinned Standard-material Mesh/InstancedMesh including arrays. Skinned
cloth rejected. Original surfaces retained throughout, no private base-material
replacement. Owns one ShaderMaterial per handle and a static copied instance buffer
for instanced halos. Nine handles share one owned quad; last release disposes it.
Idempotent disposal detaches own child, disposes owned instancing/material, decrements
quad ref once. Caller geometry/materials/textures are never disposed by the helper.
No CPU update hook, animation pulse or per-frame geometry; camera-facing world-space
quad transforms in the existing vertex shader. Original pickup visibility/collection
root removal also removes its child. Keep normal existing view disposal and collection.

## Evidence and limits

First comparison input-e365607369fe/19inputs/14.01sEXIT0, proof-first/ retained.
Three variants, actual1/2/3 rounds+dressing+groundvestbag at393x852 portrait and852x393
landscape, actual native Death corpse. Surface32draw47576tri; shell50draw48224tri;
halo41draw47606tri. First .85opacity/12cm lift halo too full/obscured tiny material
detail; visually rejected despite passing numerical checks. Candidate module/source
and raw outputs preserved. Final source changes only alpha opening/opacity/lift.

Final changed-halo follow-up input-b45c7191d76d/19hash-bound inputs/10.01sEXIT0;
source/test/staging hashes match. Two focused tests PASS: actual1/2/3 transform copy,
original materials/maps/geometry unchanged, borrowed resources never disposed,
owned/idempotent disposal, shared-quad last-user lifetime/recreation, skinned rejection.
Only changed halo captured; unchanged baseline and shell proof reused. All final four
images viewed: portrait/landscape with corpse, portrait clear, opaque wall.
Current fixture41draw47606tri,15halo instances/one140B quad plus768B instance matrices,
9private shader materials. +9draw/+30tri over32draw47576tri baseline for five items.
The fixture simultaneously exercises1/2/3 counts; not a new six-round entitlement.
Normal gameplay has its existing bounded pending supplies/stash, no new issuance.

Actual corpse covers the first round cue entirely; exposed/partly covered remaining
rounds and dressing/vest are more conspicuous. This deliberately does not see through
opaque bodies/walls. Halo6cm height plus finite radius helps exposed corpse edges
where practical; it cannot reveal every buried item. Generic opaque plane gives0
orange pixels; not every London wall/angle proof. Whole-frame colour counts include
background flames/corpse and are only rough evidence: first surface portrait804/
landscape4235; final halo1200/4441. Visible image comparison is decisive here.

Repeated dispose/recreate ends at same17geometries21borrowed corpse/world textures,
errors0; original inputs unchanged. Component renderer uses actual NoToneMapping/
SRGB and conservative pixel ratio1 versus game cap1.5. No FPS/physical-phone/compiled
runtime collection/travel/refresh/publication claim. Two bounded art runs, no full
suite/build/donor regeneration. A recovery rsync initially used a mistyped job path
and failed23; correct observed job recovered without rerunning work.

Lead component review then WebUI existing042 checkpoint integration owns native
compiled scene/corpse/pickup collection/removal/refresh/area/Retry proof. Reuse valid
040 mechanisms. Deliver a fresh official root only after exact accepted integration;
Dom must compare phone readability on that revision. No finisher-stage edits here.
