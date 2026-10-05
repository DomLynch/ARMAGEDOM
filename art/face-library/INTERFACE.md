# Actual face recipe contract — 2026-10-05

World can implement its isolated injected-library allocator now. These are actual exports in `Web/src/face-recipes.js`; recipe count/identity/order is frozen as `armagedom-face-v1`. Appearance visual review and adapter verification are in progress, not a publication claim.

Exports: `FACE_APPEARANCE_VERSION`, `FACE_RECIPES`, `ORIGINAL_FACE_ID`, `faceRecipeFor(id)`. Additional ingredient metadata exports: `FACE_HEADS`, `FACE_HAIRS`, `FACE_SKINS`, `FACE_WEATHERING`.

`FACE_RECIPES` is a frozen array of50 cached frozen objects `{id,headPreset,hairPreset,skinPreset,weatheringPreset}`. Stable string ID combines authored head/hair/skin tags; version fixes its weathering and contrast order. Two heads × five distinct hairstyle ingredients × five natural complexions, with five independent weathering presets. Authored neighbours differ in at least two head/hair/skin ingredients. Nearby recipe order is useful contrast metadata, not runtime geometry or proximity inference.

`faceRecipeFor(id)` returns the exact cached object, throws on unknown/malformed IDs and allocates nothing per call. `ORIGINAL_FACE_ID='face-original'` returns explicit original appearance and is separate from the50 variants. Original means appearance from the supplied repaired-neck source, not undoing the accepted neck repair. Library has no Three.js import, geometry, randomness, saves, placement logic or hostility/stat coupling.

World copies/sorts full stable registered resident keys including saved deaths, allocates IDs once, and preserves version-dependent assignments through refresh/return/corpses. Never use only surviving entities, actorIDs, save additions, guessed recipe IDs or per-frame randomness. World owns allocator internals/tests; Characters owns rendering ingredients and World must not author faces.

Next rendering seam: `createFaceAppearanceLibrary(repairedSourceModel)`, then `kit.apply(privateActorModel, recipeId)` after existing actor material cloning. Requires existing Photo/PhotoEyes/PhotoTeeth and restored lower-neck surface with the verified bind. Geometry caches are kit-owned; head/eye/teeth use the same position field, hair borrows the actor's Photo skeleton, complexion affects only private Photo/exposed-skin/neck materials. The implementation is not yet verified; wait for the final adapter handoff before integration.

Actor handle owns new hair material and removes hair/restores original geometry/material values on idempotent disposal. Keep it separate from existing actor material-disposal records to avoid double disposal. Dispose actor handles before actor skeletons/source resource teardown, then `kit.dispose()` after all actors. No update function or per-frame allocation. Integration remains WebUI-owned after037; no existing runtime or asset edits in this lane.
