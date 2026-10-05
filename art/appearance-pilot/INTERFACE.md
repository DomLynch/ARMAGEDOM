# Face recipe contract — representative pilot, 2026-10-05

World may prepare against this API; the approved50 library is not yet delivered. Runtime integration remains WebUI-owned after035.

Planned new pure module `Web/src/face-recipes.js` exports:
- `FACE_APPEARANCE_VERSION`: immutable library version string, changed only with authored recipe identity/appearance changes.
- `FACE_RECIPES`: frozen array of50 approved recipe objects in authored visual-contrast order. Each has stable string `id`, `headPreset`, `hairPreset`, `skinPreset`, `weatheringPreset`. No Three.js, meshes, random generator or mutable shared materials.
- `ORIGINAL_FACE_ID`: `face-original`; fallback lookup is separate from the50 allocated variants.
- `faceRecipeFor(id)`: cached frozen recipe, throws on unknown identifiers. Explicit original ID preserves the approved original fallback. No per-call allocations.

World allocates recipe IDs from `FACE_RECIPES` in contrast order using full stable registered resident identities including deaths; no save schema changes. Inputs include the version. World does not select or tint mesh ingredients.50 IDs alone are not visual acceptance; authoring and game review must verify actual contrasts.

Characters' later adapter owns private head/eyes/teeth geometry controls, hair ingredients and consistent face/neck/ear/hand/exposed-skin tinting, preserving original UVs, weights, binds, bones and clips. Appearance recipes must not couple to hostility/stats/body-size selection. Gaunt/body preset remains an independent ingredient sharing compatible authoring fields, not a recipe allocation side effect.

Current representative pilot contains original fallback plus recovered-neck, narrow/light/shaved and broad/deep/rough-crop candidates. It does not yet establish a50-item library, Crooked/minmax compatibility, in-game visibility, phone performance or runtime lifecycle acceptance.
