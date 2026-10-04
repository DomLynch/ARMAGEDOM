# Hollow clothing readability correction — 2026-10-04

New isolated `worktrees/hollow-contrast`, branch `codex/armagedom-hollow-contrast`, accepted019 base `d30e7806bf2bcefd687332ecb6533afdbf987ed8`. Integrate ONLY changed `Web/src/hollow-palette.js` and `Web/tests/hollow-palette.test.js` plus this new evidence, onto accepted020/later runtime. Existing actors hook/API unchanged; no shared actors/main/input edits, model/texture/skin/rig/weapon/flash/lighting/guard/bus changes. WebUI sole integrator, one affected normal-scale initial/Retry view in its own checkpoint.

## Why019 was too weak

Read existing native019 portrait/landscape and raw material observer: initial IDs1/2/3 were red/purple/brown and visibly tinted in the saved portrait. Retry IDs4/5/6 were ochre/charcoal/olive, an earthy grouping that can read uniformly green under warm lighting at small fight scale. Different IDs/RGB did not establish useful phone colour contrast. All COLOR_0 grime channels are equal, intensity0.7–0.95: no green vertex bias; garment4/5 remain separate from skin/head/boots. Actual phone/version still unverified; this correction addresses the demonstrated weak grouping without treating stale-cache speculation as the explanation.

## Minimal correction

Same seven cached palette objects, stronger muted linear garment factors only. Dark charcoal is darker, blue/red/purple have stronger channel separation, ochre is lighter; brown and olive retain earthy treatment. Vertex grime/roughness/shading remain active, no emission/neon or extra resources.

Replace the modulo7 arbitrary permutation with six small immutable warm/cool/contrast triplets:

1. rust red / dusty blue / dirty ochre
2. brown / muted purple / dark charcoal
3. rust red / dusty blue / olive
4. brown / muted purple / dirty ochre
5. rust red / dusty blue / dark charcoal
6. brown / muted purple / olive

ID determines warm/cool/contrast slot; seed shifts the triplet row. Every consecutive3-ID window includes one of each family, including windows crossing triplet boundaries; no need for an encounter ordinal or new state. All7 tones appear within18 IDs. Existing `hollowPaletteFor(entity.id, seed?)` and `applyHollowPalette(own, selected)` signatures unchanged. Default first group IDs1/2/3 is red/blue/ochre; Retry4/5/6 brown/purple/charcoal. SameID/seed on area return stays identical. No frame RNG, material/color/texture clone or per-frame allocation; hook remains actor-creation only on EXISTING cloned materials.

## Evidence/remaining review

`contrast-tests.txt`:9/9 focused lightweight checks PASS72.65ms. Family coverage exercised for360 startID/seed combinations (including arbitrary boundary starts), plus initial/Retry groups, all7 availability, stronger channel/luminance bounds, cached identity, garment-only writes, clone independence and original GLB/hash/detail preservation. `contrast-old-regression.txt`:same9 tests against actual accepted019 helper exit1,6PASS/3FAIL; the new family/firstRetry/contrast checks detect the prior weakness. Existing inputs are unchanged; don't duplicate full art/rig/fight/routes campaigns. No new capture or generated design project.

RGB family/luminance checks prove the deterministic correction, not perceptual phone acceptance. WebUI should inspect initial AND Retry at actual normal London portrait/landscape scale in one integrated pass; confirm garment distinctions under existing light and flash restore/re-entry stability. Reuse existing assets/animation/route evidence and run its affected gate/package checkpoint once. No new clothing geometry/tears/textures or skin recolouring. Owner phone readability remains open until the reviewed release is actually displayed.
