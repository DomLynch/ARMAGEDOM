# ARMAGEDOM hub NPC bodies (built 2026-10-28)

Pipeline as the crowd: hand-authored rows (rows/npc-rows.json, npc-look-rows.json, npc-palette-rows.json, mh-silhouette-rows.json) -> mh_batch.py (tools-mh3: MPFB2 2.0.18 export, 106-joint factory) -> `<id>-full-phone-mixamorig.glb` -> reduce2.mjs at 13500 tris (meshoptimizer simplifier, 1024 px WebP, quantize + meshopt). Same scripts in rows/ (reduce2.mjs, inspect.py, report.py, run.sh, build.sh).

| id | tris | bytes | gz | joints | Layer_/Sword/Weapon | clips | draws | textures |
|---|---|---|---|---|---|---|---|---|
| mh-npc-marsh | 13500 | 520580 | 377494 | 106 | 0 | 12 | 2 | 1024x1024/22K (colour), 1024x1024/108K (normal), 1024x256/52K (brow+lash) |
| mh-npc-okafor | 13499 | 497848 | 355448 | 106 | 0 | 12 | 2 | 1024x1024/14K, 1024x1024/102K, 1024x256/43K |
| mh-npc-reyes | 13500 | 466784 | 325271 | 106 | 0 | 12 | 2 | 1024x1024/18K, 1024x1024/60K, 1024x256/55K |

All under 600 KB gzipped. Joint set is the same as the crowd bodies: 106 unique joints, 64 named `mixamorig:*` plus 42 extras (root, ik_*, twist/helper joints).

## Wardrobe (what stands in for the brief, and compromises)
- **Marsh, quartermaster**: male_casualsuit05 (olive field jacket with lapels and four flap pockets, red pinstripe shirt under it, jeans) + shoes02 (brown boots, dark recolour). Stands in for the work jacket; solid build (bulk heavy, broad shoulders, 1.78 m), grey short04 hair, middleage_caucasian_male skin. Compromise: the shirt under the jacket is the pack's red pinstripe; worksuit01 (overalls) was not used because it reads as dungarees, not a jacket.
- **Dr. Okafor, field medic**: female_elegantsuit01 (long-sleeve collared blouse + knee skirt), recoloured pale scrub teal and flattened (gamma 0.06) so the pinstripe is a faint ribbing. Skin middleage_african_female, race mix 85 % african, age 0.64 (about 40), ponytail01 black, shoes05 white. **Compromises: the pack has no coat asset and no scrubs, and no two-clothes layering was attempted. Result reads as a teal scrub-style tunic dress, not "scrubs under a coat".** First try, female_sportsuit01 (tee + leggings), was rejected: the tee is a crop top that bares the midriff, and the leggings showed white fray artefacts at the ankles.
- **Reyes, radio operator**: male_casualsuit01 (plain long-sleeve top recoloured heather grey, dark jeans) + shoes03. **Compromise: it has a collar and a short placket, so it reads as a plain shirt/sweater, not a hoodie. The pack has no hood garment.** No print. young_caucasian_male2 skin, race mix 55/30/15, short02 black hair, thin, slight hunch, narrow shoulders, 1.74 m.

## Logo audit (clothes diffuse textures in the MPFB data dir)
The MakeHuman circle-and-figure logo is printed on: **male_casualsuit02, male_casualsuit04, male_casualsuit06 (faint wordmark plus logo), female_casualsuit01, female_casualsuit02**. A tiny "www.makehuman.org" watermark sits in the unused corner of most textures (not on the mapped garment areas). Clean (no print): male_casualsuit01, 03, 05, male_elegantsuit01, male_worksuit01, female_elegantsuit01, female_sportsuit01. None of the five printed ones is used.

## Chest close-ups (chest.png, face.png; three.js in headless chromium on the VPS, looked at)
Marsh: olive jacket, pocket flaps, red pinstripe shirt, no ring, figure, text or logo. Okafor: teal blouse, buttons, faint ribbing, no print. Reyes: plain grey shirt, no print. Face and back views (face.png, re-rendered after the final build): no print on any back. One thing seen: a faint light arc at Marsh's hairline in face.png, which looks like a hair-card seam, not a print (not examined further).

## Not verified
- Clip playback was not rendered; only the clip count (12) and joint count were checked.
- Distinctness vs the first 30 judged by eye from the old rows, not by a side-by-side with all 30.
- Pack licence statements come from the two manifests (CC0 94/94 and 23/23); installed-file hashes are from /root/mpfb_asset_hashes.json (made earlier today), not re-hashed now.
