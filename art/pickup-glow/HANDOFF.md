# Pickup surface highlight — Characters component, 2026-10-05

Base: `fa2277f58fa437cb69ecd98db948a68e8eed997a` (accepted039).
Only new runtime module `Web/src/pickup-glow.js`, 1168 bytes, SHA256
`ebe4bff82d2302ee281d670976ca563c58a024f2b9502a906055e9d642ea47e6`.
Focused tests `Web/tests/pickup-glow.test.js`, SHA256
`a589f6068bf35da53839203496a184b93897670405fa373b6a145dd917dae670`.
Existing pickup-outline/supplies-view/vest-view, actors, world, gameplay and saves untouched.

## Interface and integration

`addPickupGlow(mesh)` returns `{dispose()}`. For unskinned Mesh or InstancedMesh
with Standard materials; rejects equipped SkinnedMesh. Constant self-lit orange
uses existing hit feedback's linear RGB (.65,.2,.05), intensity1; private basecolour
multiplied .4 retains surface shading/markings; toneMapped=false. Geometry,
instance transforms/count, UVs, maps and original materials are borrowed unchanged.
One private material clone per input material; no update/time hook or extra mesh.

WebUI alone replaces addPickupOutline import/calls with addPickupGlow at the same
existing ground-item sites: ammo case+tip, dressing packet, ground vestbag+strap.
Retain existing handle disposal before original materials are disposed. Dispose
restores original material identity when still owned, frees only clones once,
never textures/geometries/skeletons. Keep equipped vest code unchanged. Remove
old outline calls rather than layering both; current floor-ring pulse can remain.
No API for loot/save/eligibility/radius/stats and no collection logic change.

## Evidence and limits

Final existing VPS job `input-f6d2f11675d9`, 9.01s EXIT0, 16 transferred inputs
hash verified and recovered under `proof/`; all current staged hashes checked.
Two focused tests PASS: actual instancing1/2/3 preserves matrices/geometry/maps,
private clone+restoration/idempotent disposal, multiple materials, rejects skinned
cloth. Component factory art uses exact039 actual pickup views and London world
at selected006 camera1.3365, item scale unchanged; five fixture items at x=-1,-.5,0,.5,1,
z=-5.6. All seven images inspected; baseline images byte-identical to first proof.

Portrait and landscape: 29→20 calls (nine old edge batches removed),627 triangles
unchanged; detail25→16 calls,612 triangles. Helper itself adds zero draws/triangles/
lights/textures/dependencies. Nine owned material clones across five ground items;
old edge resources absent in proposed integration. In the fixture old outlines
are hidden; view disposal still frees them. Warm repeated cleanup exact5 geometries/
3 world textures, errors0. Opaque component plane gives0 orange pixels; not every
London wall or physical-phone proof. Whole-frame orange pixel counts include
background and are a rough comparison only: portrait542→873, landscape3056→3179,
detail1368→8886. No bloom or halo; physical surface colour remains normally occluded.

First job `input-6f01a688920d` 9.01s EXIT0 preserved in `proof-first/`; bright yellow
emissive1.6 passed checks but was visually rejected for flattened bag shading.
Second `input-a1f110efc60e`9.01s EXIT1 preserved in `proof-orange-raw/`: final orange
source passed focused tests, but capture pixel criterion used linear render-target
bytes rather than displayed sRGB. Final capture corrects target colour space;
no product/test source change after second job. Intermediate embedded handwritten
source manifest is an initial snapshot; per-job request hashes bind actual inputs.

Ready for component review/integration only. No full gate/build/runtime collection/
new reward issuance/publication/phone acceptance claim. Reuse unchanged038 mechanics
receipts; WebUI/Lead own frozen integration gate and ordinary touch collection/refresh.
Do not merge private baseline wholesale: take the new module/tests and art evidence.
