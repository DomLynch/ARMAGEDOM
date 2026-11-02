# Bridge Warden body (boss-warden), Mixamo V2 Vanguard on the 106 rig

- Source: vanguard-by-t-choonyung-full-phone-mixamorig.glb (Mixamo V2 "Vanguard", T. Choonyung), sha256 b4ad79158c455a1eef1b19fc9628c466b5ad64fb05cc188927ba20b0d95522ab (manifest `provenance.sourceSHA256`).
- Licence: Mixamo, cleared by Dom 2026-10-23.
- Build: `node build-boss.mjs <source.glb> hunter-pitborn-106.glb Web/public/assets/bosses/boss-warden.glb` (9 own clips kept; Layer_* nodes and Stress_* clips dropped; Return, Riposte, Parry, BlockImpact, Deflected, StrafeLeft, StrafeRight borrowed from the hunter and delta-retargeted; WebP q85; meshopt).
- Ragdoll row: `node physics-rows.mjs` (body `vanguard-106`), then the floor table via tools/physics-floor-support.mjs boss-warden.
- Strike path: `node attack-path.mjs boss-warden.glb 1 area-content.json` (scale 1: contactScale 1.229925 = manifest scale 0.93 x 1.3225 carries the scale, as public-area-bosses pins). The Warden is unarmed; the strike is a virtual 1.3 m reach from the right-hand socket so the heavy attack reaches the player at its AI range.
- The old maul carrier body is kept as `provenance.previous` in the manifest row. The Warden has no ranged rule (weapons.bossRanged lists only the Stalker and Butcher).
