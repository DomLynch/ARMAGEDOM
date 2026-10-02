# Ashvault — 2026-10-02

## Objective and scope
Small local isometric action RPG: four chambers, melee combat, dodge, upgrades,
boss and restart. Target run length 5–10 minutes. No backend, accounts, networking
or inventory grid. Unity 6000.3.25f1, Built-in renderer, Mac desktop app.

## Current delivery
- Gothic art pass built at `Builds/Ashvault.app` and visibly opened on the Mac.
- Nine runtime scripts; gameplay roots/colliders remain separate from visual children.
- Licensed Flare rigged knight, goblin, hobgoblin variants, warlock and skeleton mage;
  original Blender ruins and CC0 Poly Haven stone textures. Attribution ships in StreamingAssets.
- CPU albedo/AO baking, explicit materials, corrected FBX scaling and UV atlases,
  idle/run/attack clips, closer camera and muted palette. Orc/ogre share a base model.
- Local Blender CPU only; no paid GPU or cloud job/spend. No remote or deployment target.

## Verified evidence
- Final art/code version: 7/7 real PlayMode tests passed in `artifacts/playmode-results.json`.
  Covers combat, dodge, restart, telegraph timing, full run/loot, shader dependencies,
  plus six-actor geometry height, material/texture dependencies, clips and collider separation.
- Mac build `build_6092935520d4`: succeeded, zero errors; expected Pipeline-runtime-disabled warning.
- Actual standalone startup smoke passed without exceptions; assembly hash in
  `artifacts/player-smoke.json`. Required gates are `scripts/verify.py` and `scripts/smoke_mac.py`.
- Native visible review: textured stone/ruins, knight and first-wave creatures render;
  W/Space movement and dodge observed (0.6s cooldown), 1 shockwave observed (6.2s
  cooldown), enemy approach/death observed, R restores safe entrance and 100 HP.
- Real reusable skill saved and validated at
  `/Users/domininclynch/.codex/skills/unity-blender-cpu-art/SKILL.md`.
  Project-specific details live in `art/UNITY-ART-WORKFLOW.md`.

## Remaining acceptance
The prototype is playable for review. Creatures remain visibly stylized; this does
not yet meet the requested grounded Witcher character fidelity. Lighting/contact
shadows and character materials need further refinement. Prioritize one approved
character at game scale before another roster pass. Human difficulty, feel and
5–10 minute pacing await user playtesting; Windows build remains untested.
Old source Blender reflection-image warnings do not indicate a runtime dependency:
Unity uses exported baked textures, which were checked in the native build.
