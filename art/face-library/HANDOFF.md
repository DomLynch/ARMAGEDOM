# Fifty Hollow appearances — component ready for integration review

2026-10-05. Characters-owned clothing-art lane. **Actual50 frozen recipes, shared head/hair/complexion/weathering adapter, reviewed contact sheet and representative original-rig/London proof.** No existing runtime edits,50 full bodies, new textures, paid inference, main-player change or served/phone claim. Gaunt geometry remains later.

## Exact intake

Pure recipe component `3dc84b7`: only new `Web/src/face-recipes.js`, `Web/tests/face-recipes.test.js` and contract/evidence. Final adapter component adds only new `Web/src/face-appearance.js`, `Web/tests/face-appearance.test.js` plus art evidence. Intake bounded new files; do not merge this older private baseline. Exact SHA/bytes in `source-files.json`.

Actual exports/IDs/version/ordering/fallback are pinned in `INTERFACE.md`. `FACE_APPEARANCE_VERSION='armagedom-face-v1'`,50 cached frozen recipes, `faceRecipeFor(id)` throws unknown IDs; explicit `face-original` fallback is outside the50. All2heads×5hair×5complexions occur once; five separate weathering fields, no hostility/stats linkage. Authored neighbours differ in >=2 head/hair/skin ingredients. This supports data contrast ordering, not actual spatial adjacency acceptance.

## Renderer seam and ownership

`createFaceAppearanceLibrary(repairedSourceModel)` once per loaded Hollow source. Use the repaired lower-neck base from the previous pilot, exactSHA352533ecf93234b23a69752b266b134eee387c35e5fc87ea0c2230085fa4f1ff; WebUI owns037neck intake and any corresponding final source asset pin. The adapter requires original Photo/PhotoEyes/PhotoTeeth plus `PropertyBinding.sanitizeNodeName('Recovered donor lower neck')`. If037changes that semantic node name, reconcile this explicit binding before integration; do not silently modify the source asset or skip neck coverage.

After existing SkeletonUtils cloning/equipment/material cloning, for **Hollow mobs only**, call `view.appearance=kit.apply(model, stableRecipeId)`. World supplies ID from its full registered roster map including deaths. Apply once per actor; dispose the previous handle before any deliberate recipe replacement. No per-frame update, random choices, new save fields or body/rig/weapon controls.

Head/eye/teeth cached geometries share the same smooth bind-space field, which is zero through the neck transition; normals use inverse-transpose of its Jacobian. Original UVs/weights/binds/bones/clips stay intact. Skin tint changes only private Photo/exposed-skin/lower-neck materials; clothing/eyes/teeth/boots/weapons remain isolated. Source/shared actor-material input is rejected before mutation. Weathering uses vertex colour on the private head cache; no new images.

Hair ingredients borrow the actor's Photo skeleton and bind, and reuse its original scalp texture. Buzz adds no mesh; rough-crop/short crest/back-crop/messy each add one shared geometry mesh and one privately owned material. Crown seam copies are welded only within matching positions/joints/weights, with smooth normals and boundary walls rooted against the scalp. New hair material is owned/disposed by the actor's appearance handle. **Do not add it to the existing actor disposal material list**; `extraMaterials` is a read-only integration opportunity for visual flash handling, not transferred ownership.

Call `view.appearance.dispose()` before motion/skeleton teardown. It removes hair, disposes its material once, restores original geometry/material values and never disposes the borrowed skeleton or source textures. Existing actor logic continues to own original private materials/skeletons. Dispose all appearance handles, then `kit.dispose()` when clearing loaded actors/library; live handles make premature kit disposal throw. Cached geometries belong to the kit and are disposed once after actors.

## Evidence and visual verdict

Final `input-aacd9d36539e`:24.01sEXIT0/18inputs. Five focused pure/real-GLB tests PASS; actual50 shared combinations, source/other-actor/material preservation, normalized hair weights, explicit fallback, malformed/shared-material rejection, cache bounds, idempotent owned disposal and borrowed skeleton protection.

Five representative ingredient actors across all hairstyles, light/deep complexions and both heads: twelve pose samples cover native Idle/Walk/Attack/Guard/Hit/Death plus Crooked85/115 Walk/Hit/Death. All posed vertices finite; original bone and native knife-matrix deltas exactly0 against same-factor pristine paired clones; no browser errors. Sampling is bounded, not continuous clearance or a compiled minmax fight. Unchanged underlying clip/contact evidence from the neck/original-rig work is reused.

`proof/face-50-contact-sheet.png`:1800×1280, all50 actual recipes at one matched Guard pose; knife deliberately hidden ONLY in this head sheet. Original real photograph remains the common face base. Head-width changes alone are subtle at selected006; silhouette/complexion/size carry the stronger game-distance contrast. These are50 appearance combinations, not50 unrelated photogrammetric identities. Weathering details are mainly close-up features; hairstyles remain a modest game-resolution asset treatment.

Personally inspected the sheet, native full-body poses, Crooked extremes and clear full-head/corpse views. First pass had floating back-crop and a tall blocky crest. Final hair uses connected boundary walls, lower/tapered crest and reused scalp diffuse image. Corrected sheet/poses replace that first visual acceptance; older passing numerical/disposal receipts remain historical.

Final London `input-69c5af29dc29`:8.03sEXIT0/21inputs, same adapter/recipe/base hashes, selected006 camera and unchanged Westminster art. Personally viewed narrow/messy/light85% + broad/crest/deepCrooked115% Walk/Hit/Death393×852 and Walk852×393, no errors. These are isolated art camera scenes with sampled motion, **not gameplay/roster/refresh/area/collision/phone proof**. Hair, size and complexion remain readable; a full50 crowd is neither required nor claimed.

Failed first setup `input-2d50aaa434bf`:3.01sEXIT1; raw2real-GLB failures retained. Loader sanitised neck name while adapter initially queried spaces; fixed by actual PropertyBinding naming, not weakening the requirement. Intermediate `input-792ba004a619`:23.02sEXIT0, first hair visuals superseded; source snapshot/receipts retained. No failed run relabelled as a pass.

## Costs and remaining work

Two runtime modules total10,442unminified bytes. **Zero new downloaded model/image assets** beyond the separately accepted repaired neck source; no50-model payload.22 shared generated geometry caches,6,215,928 typed-array bytes (~5.93MiB) after all50, shared across actors. This is geometry-buffer accounting, not total JS/GPU/device memory.

Measured equipped actor cost: buzz12calls/46,949tri; hair13calls/up to48,282tri (max+1,333 over repaired baseline). Five representative rig scene64calls/238,637tri. Weapon-hidden contact tiles10/11calls and43,755–45,088tri; do not report these as equipped costs. No new texture maps/images: warm disposal baseline12geometries/19textures restored exactly after all actor appearances/cache geometries released. No phone FPS or frame-time claim.

Lead/Auditor review and WebUI integration are next. World implements stable full-roster allocation with this pinned library. WebUI alone adds the small actor/library seam after037, preserves player/vest/palette ownership, proves native crowd/corpse/refresh/area identity and integrates disposal; integration package/served identity/physical-phone checks remain separate. Original appearance is the explicit fallback and original assets are preserved. Claude untouched/Codex hooks off; all heavy work used existing VPS queue.
