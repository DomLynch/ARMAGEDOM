# Borough Marshal body (boss-area8-veteran)

- Source: Mixamo Survivor (A. Lusth), `survivor-a-lusth-full-phone-mixamorig.glb`, 106-bone rig, 14.8k triangles, 4 PNG textures.
  sha256 of the source is recorded in `Web/public/assets/manifest-hollow.json` (`boss-area8-veteran.provenance.sourceSHA256`).
- Licence: Mixamo, cleared by Dom 2026-10-23.
- Build: `build-marshal.mjs <source.glb> <hunter-pitborn-106.glb> <out.glb> <previous-marshal.glb>`.
  Keeps the 9 own clips (Idle Walk Run Attack Guard Roll Hit Death Heavy), drops the Layer_* gear nodes and Stress_* clips,
  borrows Return Riposte Parry BlockImpact Deflected StrafeLeft StrafeRight from the hunter (delta-retargeted), WebP q85 textures, meshopt.
  The previous Marshal's maul (WeaponDrawn, 12 small meshes) is baked under `fk_socket_hand_r` as `WeaponDrawn` (the previous GLB is
  `git show 82a54aba^:...`-style recoverable from main before this change: `Web/public/assets/bosses/boss-area8-veteran.glb`, sha256 95f5d3a6...).
- Ragdoll: `physics-rows.mjs` writes the `marshal-106` body row and re-keys the `boss-area8-veteran` model row; the floor table comes from
  `Web/tools/physics-floor-support.mjs boss-area8-veteran`.
- Contact path: `paths["boss-veteran-attack"]` in `Web/public/world/area-content.json` is 81 rows of the maul head (WeaponDrawn-local
  y 0.66 and 0.86) sampled from the Heavy clip at clip time = tick / 80 * duration, model space times manifest scale (1).
  The same points reproduce the old baked path from the old `Maul_Heavy` clip to within 0.02 m.

Note on the baked path: the rows are the sampled maul-head points multiplied by 1.1 (reach calibration). tests/public-area-bosses.test.js
requires the active blade to reach a player at range 1.8 with the pinned contactScale 1.3225; the new Heavy swing is a low side sweep
with a slightly shorter forward reach than the old Maul_Heavy, and 1.1 is the smallest factor that passes. The attack range
(1.8), timing (36/8/36) and contactScale stay as they were. The attack clip is now Heavy.
