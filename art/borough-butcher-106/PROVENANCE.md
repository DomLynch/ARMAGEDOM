# Borough Butcher body (boss-butcher)

- Source: Mixamo Warrok (W. Kurniawan), warrok-w-kurniawan-full-phone-mixamorig.glb, sha256 51314e948c4b5af4b61f58cee2955495aa46cab06719f28954828db162594417. Licence: Mixamo, cleared by Dom 2026-10-23.
- Built with build-butcher.mjs: 9 own clips kept, Layer_* gear nodes and Stress_* clips dropped, Return/Riposte/Parry/BlockImpact/Deflected/StrafeLeft/StrafeRight borrowed from the Pitborn hunter and delta-retargeted, weapons/pitborn-cleaver-phone.glb baked as WeaponDrawn under fk_socket_hand_r, textures WebP q85, meshopt medium.
- Result: Web/public/assets/bosses/boss-butcher.glb, 735832 bytes, sha256 28f390aed858f9335ec72fa8632c360d7baece4fb94be4e660d3047276d0aff3 (the manifest row holds the same values).
- physics-rows.mjs writes the butcher-106 ragdoll body and the boss-butcher model row; attack-path.mjs bakes paths["boss-butcher-attack"] from the Attack clip.
- Replaced body: the 65-bone boss-butcher.glb (2545444 bytes), kept in git history.
