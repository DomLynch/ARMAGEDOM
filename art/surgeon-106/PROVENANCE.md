# Lambeth Surgeon body (boss-surgeon)

- Source: Mixamo Whiteclown (N. Hallin) full-phone-mixamorig GLB; its sha256 is `provenance.sourceSHA256` in `Web/public/assets/manifest-hollow.json` (row `boss-surgeon`). Licence: Mixamo, cleared by Dom 2026-10-23.
- Build: `node build-boss.mjs <source.glb> hunter-pitborn-106.glb Web/public/assets/bosses/boss-surgeon.glb`. Kept the 9 own clips, dropped Layer_* nodes, borrowed Return/Riposte/Parry/BlockImpact/Deflected/StrafeLeft/StrafeRight from the hunter, WebP q85, meshopt. Adds an empty `WeaponDrawn` node under `fk_socket_hand_r` whose rotation is the per-weapon hand offset (the saw is built at runtime and replaces it).
- Ragdoll rows: `node art/surgeon-106/physics-rows.mjs` from the repo root, then `node tools/physics-floor-support.mjs boss-surgeon` from Web/.
- Strike path: `node art/surgeon-106/attack-path.mjs Web/public/assets/bosses/boss-surgeon.glb 1 Web/public/world/area-content.json` (scale 1; profile contactScale 1.1439625 = manifest scale 0.865 x 1.3225), then `python -I tools/world-manifest-fix.py`.
- Replaced the 65-bone `boss-surgeon.glb` (1951248 bytes, sha256 78091f12...09ddd), kept in git history as the rollback.
