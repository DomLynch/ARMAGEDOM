# Packs used for crowd batch 2

Built with MPFB2 2.0.18 using only the official MakeHuman CC0 asset packs makehuman_system_assets_cc0 (94 assets, CC0 94/94) and skins01_cc0 (23 assets, CC0 23/23); the MPFB2 data directory held only these two packs when built (verified listing attached). Extra packs equipment01_cc0 (8, CC0 8/8), hats02_cc0 (6, CC0 6/6), masks01_cc0 (9: 8 CC0 + 1 CC-BY, hero_mask_5) were downloaded 2026-10-24 but not installed and not used.

Checks run at build (2026-10-28): manifest counts from the installed pack JSON: makehuman_system_assets 94 assets, licences {'CC0': 94}; skins01 23 assets, licences {'CC0': 23}. SHA256 of all 374 installed asset files re-checked against /root/mpfb_asset_hashes.json: 0 mismatches.

Pool restrictions for this batch: clothes only male_casualsuit01/03/05, male_elegantsuit01, male_worksuit01, female_sportsuit01, female_elegantsuit01 (the suits whose tee texture has no MakeHuman ring-figure logo; female_casualsuit01/02, male_casualsuit02/04/06 carry it and were not used), shoes01-06 only. The pack also installs fedora01 and fedora_cocked (system pack hats): not used. No equipment, hats, masks, belts, gloves, capes.

## Fresh listing of the MPFB2 data directory

Path: /root/.config/blender/5.2/extensions/.user/user_default/mpfb/data

```
clothes/ (20): fedora01 fedora_cocked female_casualsuit01 female_casualsuit02 female_elegantsuit01 female_sportsuit01 male_casualsuit01 male_casualsuit02 male_casualsuit03 male_casualsuit04 male_casualsuit05 male_casualsuit06 male_elegantsuit01 male_worksuit01 shoes01 shoes02 shoes03 shoes04 shoes05 shoes06
eyebrows/ (12): eyebrow001 eyebrow002 eyebrow003 eyebrow004 eyebrow005 eyebrow006 eyebrow007 eyebrow008 eyebrow009 eyebrow010 eyebrow011 eyebrow012
eyelashes/ (4): eyelashes01 eyelashes02 eyelashes03 eyelashes04
eyes/ (3): high-poly low-poly materials
hair/ (10): afro01 bob01 bob02 braid01 long01 ponytail01 short01 short02 short03 short04
packs/makehuman_system_assets.json
packs/skins01.json
proxymeshes/ (7): female1605 female_generic female_muscle_13442 male1591 male_generic male_muscle_13290 proxy741
skins/ (46): blindsaypatten_uniform_skin_texture bobby_03_young_female_hairless callharvey3d_midtoned_female cutoff3d_indian_female_enhanced cutoff3d_indian_female_skin darthfurby_caucasian_female flower-angel_red_head_skin middleage_african_female middleage_african_male middleage_asian_female middleage_asian_male middleage_caucasian_female middleage_caucasian_male nyloseth_zoeyskin old_african_female old_african_male old_asian_female old_asian_male old_caucasian_female old_caucasian_male onlytheghosts_middle_aged_eurasian_female onlytheghosts_old_eurasian_female onlytheghosts_young_eurasian_female saltycowdawg_genuine_caucasian_female_with_genitals skalldyrssuppe_creamy_female spreadcore_alana_caucasian_female_with_genitals_skin toigo_light_skin_female_bronze toigo_light_skin_female_bronze_with_makeup toigo_light_skin_female_freckles toigo_light_skin_female_ginger toigo_light_skin_female_ginger_2 toigo_light_skin_female_ginger_with_makeup toigo_light_skin_female_with_violet_makeup toigo_light_skin_with_makeup toigo_light_skin_with_natural_makeup toon01 young_african_female young_african_male young_asian_female young_asian_male young_caucasian_female young_caucasian_female2 young_caucasian_female_special_suit young_caucasian_male young_caucasian_male2 young_caucasian_male_special_suit
teeth/ (6): teeth_base teeth_shape01 teeth_shape02 teeth_shape03 teeth_shape04 teeth_shape05
tongue/ (1): tongue01
```
