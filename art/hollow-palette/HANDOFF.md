# Seven Hollow clothing palettes — 2026-10-04

Tiny isolated art/config handoff. `worktrees/hollow-palette`, branch `codex/armagedom-hollow-palette`, accepted016 base `d01911f3445bc17c6bc679049bcecee56496e501`. NEW helper/test/handoff only. No existing actors/main/input/runtime edit, no changed asset, no new model/texture/download. WebUI alone integrates after ordered cadence/recoil batches; Lead owns acceptance/publication.

## Pinned garment inspection

Hollow GLB SHA `b309eeb508a1c31babbfeaf13275ace3f54990dab380ae719c0d5881416f89fc` unchanged. Seven material slots:

| Index | Exact name | Treatment |
|---|---|---|
|0|Photo|head/hair, unchanged|
|1|PhotoEyes|unchanged|
|2|PhotoTeeth|unchanged|
|3|Ash-grey affected skin|unchanged|
|4|Torn charcoal canvas jacket|jacket tint only|
|5|Worn tobacco trousers|trouser tint only|
|6|Dirty black work boots|unchanged|

Mesh1 primitive0 is jacket4. Mesh2 splits skin3/jacket4/trousers5/boots6 into separate primitives; all four retain COLOR_0 grime. Clothing does not share a head/skin material. Garment materials have no fabric image texture; preserve existing vertex grime and all existing texture/normal references elsewhere, rather than claiming newly detailed fabric. Native rig/geometry/knife/source provenance unchanged.

## Integration (spawn/actor creation only)

```js
import {hollowPaletteFor,applyHollowPalette} from './hollow-palette.js';
const palette = entity.rig==='hollow-scavenger'
  ? hollowPaletteFor(entity.id, 'westminster-hollow') : null;
// Inside the EXISTING original.map clone loop, after const own=m.clone():
if (palette) applyHollowPalette(own,palette);
// Keep existing materials.push({material:own,emissive:...,intensity:...}) unchanged.
```

Choose once for each actor creation. Apply only to existing per-actor material clones; calling on cached source materials would tint all actors. The helper never allocates materials/colors/textures/geometries, never modifies emissive/flash/roughness/opacity, and ignores every name except exact garment4/5. No additional draw calls, shader variant or per-frame work. Existing actor resource cleanup remains sufficient.

Stable integer entity ID + string encounter seed determines a cached frozen palette. Existing Hollow spawning assigns consecutive IDs, so first3 are always distinct and first7 cover all7. Multiplication-by3 modulo7 plus a seeded offset gives deterministic variety, independent of traversal order or dead actors disappearing. Default seed yields IDs1/2/3 as dark-red/muted-purple/brown; later starting IDs rotate that sequence. Do not derive selection from each frame's surviving enemy array index. Same actor ID/seed reproduces its colour on area return/view recreation. If introducing a random run seed later, generate/store once per encounter; do not randomize per frame. Retry may legitimately get new IDs/colours; no persistence system is added.

Palette IDs: charcoal, brown, dark-red, olive, dirty-ochre, muted-purple, dusty-blue-grey. Jacket factors are muted, linear RGB glTF-style multipliers. Trousers have related lower-intensity tones. `setRGB` receives linear values, preserving loaded colour-space handling; do not reinterpret them as hex sRGB. The seven cached objects and their pairs are frozen.

## Evidence and limits

Focused checks PASS7/7, actual pinned GLB metadata/hash inspected: garment/skin separation and COLOR_0 preservation, seven unique bounded tones, first3 distinct/all7 cycling across seeds/startIDs, area-return identity, exclusively garment colour writes, independent clone state, invalid input rejection. Run `node --test Web/tests/hollow-palette.test.js` (74.93ms local lightweight run). Original assets and all existing runtime inputs unchanged; reuse valid016 animation/grip/route/asset receipts. No heavy job, repeated build, generated variants or extra paid service.

This handoff is not integrated/served. No new same-rig render campaign needed to prove the material partition; visual strength of palette differences under actual London lighting and a normal three-Hollow encounter remains WebUI's single integrated review. No phone/performance acceptance claimed. Mandatory integrated gate/build/closure/flash/material isolation and exact publication belong to the eventual runtime checkpoint, reusing unchanged evidence where applicable. If the loaded material names differ, fail/localize actual loader naming; do not broaden to skin or whole-body tint.
