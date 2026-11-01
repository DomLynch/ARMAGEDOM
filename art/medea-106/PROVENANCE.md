Ember Matron body (boss-westminster-witch): Mixamo V2 "Medea" (M. Arrebola) on the 106-bone rig.

- Source file: medea-by-m-arrebola-full-phone-mixamorig.glb
- Source sha256: cd4dce749a7c50c1d0f9ce074f390c2025e1f231fa8d434d2efd03dc9482bd72
- Licence: Mixamo, cleared by Dom 2026-10-23
- Built with: build-boss.mjs (copy of art/perseus-106/build-perseus.mjs recipe): `node build-boss.mjs <source.glb> hunter-pitborn-106.glb <out.glb>`
- Kept: 106-joint skeleton, bind pose, nine own clips (Idle Walk Run Attack Guard Roll Hit Death Heavy); Return, Riposte, Parry, BlockImpact, Deflected, StrafeLeft, StrafeRight borrowed from the hunter, delta-retargeted.
- Dropped: Layer_* gear nodes, Stress_* clips.
- Textures WebP q85, meshopt packed: 752876 bytes.
- physics-rows.mjs adds the `medea-106` ragdoll body row and re-points the boss-westminster-witch model row to it (floor table: Web/tools/physics-floor-support.mjs boss-westminster-witch).
