# Ashvault — 2026-10-02

## Objective and scope
Small local isometric action RPG: four chambers, melee combat, dodge, upgrades,
boss and restart. Target run length 5–10 minutes. No backend/accounts/networking.
Unity 6000.3.25f1, Built-in renderer, Mac desktop app at `Builds/Ashvault.app`.

## Current delivery
Original HD Warden replaces the earlier Flare hero: original generated reference,
TRELLIS.2 reconstructed body, 198,630 body triangles, 4K PBR maps, original 19-bone
CPU rig, idle/run/attack clips and Ashblade. Reflection lighting gives steel readable
highlights. Geometry and visual components remain separate from gameplay colliders.
V pauses into the same hero/materials close-up; arrows orbit; V restores gameplay/HUD.
Mouse wheel adjusts gameplay zoom. Ten runtime scripts.
Movement update: hero turns toward travel, keeps its idle heading, and faces attacks.
LMB ground clicks move at any angle (hold to steer); enemy clicks approach/slash.
WASD overrides click travel; Shift+LMB slashes in place; RMB heavy, Space dodge.
Click movement retains collisions and stops if blocked; no navigation around walls.

Original Blender ruins, CC0 stone and credited Flare enemies remain from the previous
pass. This task improves the hero; orc/ogre still share a base model.
No purchased hero asset, paid HF Job or paid GPU compute. Two successful official
TRELLIS.2 shared-GPU runs stayed within included quota (overquotaUsed=0). Rigging and
conversion ran locally on CPU. This is not CPU-only reconstruction.

## Verified evidence
- 10/10 real PlayMode tests passed after movement/input changes, including combat, dodge,
  restart, full-run progression, import materials/clips, inspection state/HUD,
  cardinal/diagonal turning, speed limits, persistent destination/stop and rapid clicks.
- Build `build_62f263ac928c`: succeeded, zero errors, 211,913,462 bytes.
  One expected warning: remote Pipeline runtime disabled in distributed app.
- Actual Mac startup smoke passed without exceptions; assembly SHA256 recorded in
  `artifacts/player-smoke.json`. Gates: `.quality-gate.json`.
- Native mouse clicks in both directions turn and move the hero; held steering, dodge
  and restart exercised. Receipt: `artifacts/movement-native-review.json`. App reset
  to safe entrance. Enemy-click auto-attack needs separate native acceptance.
- Native hero/materials, inspection HUD fix, return to gameplay and input exercised.
  Screenshot and receipt: `artifacts/hero/native-inspection.png`, `native-review.json`.
- Final Attack pose at 0.3s reviewed: no obvious detached limbs, shoulder explosion
  or scale spike; screenshots `artifacts/hero/strike-final*.png`. Full motion polish remains.
- Ruff and source/doc whitespace checks passed. Unity serialized files retain their
  normal empty-field spacing. CodeGraph refreshed.
- Skill `~/.codex/skills/unity-blender-cpu-art/SKILL.md` updated and validator passed;
  reconstruction/import lessons in its `references/original-hero.md`.

## Closed failures
Movement previously faced the cursor while walking. Travel now owns idle/walking
heading; attacks own strike heading. A rapid native mouse click exposed missed
press/release edges: use enabled InputActions to capture them, with a regression
that presses and releases in the same input update (10/10 final suite passes).

Packed WebP bytes under PNG names caused missing Unity textures: explicitly reencoded
pixel data into actual PNGs, verified imported maps. HUD lookup ran before HUD Start:
resolve on first inspection toggle; regression test checks hide/restore.
Builds initially reported 6,993 TypeDB duplicate-registration errors despite Succeeded.
CleanBuildCache and editor restart did not resolve them. Stopped editor, preserved old
Library at `/tmp/Ashvault-Library-before-hero-clean-20261002`, regenerated Library,
then the same clean build workflow returned zero errors. No checks were weakened.

## Remaining acceptance
User judges the requested 9/10 hero fidelity. This is a reconstructed prototype;
procedural motion, fingers/underarms and the simple sword still need refinement.
Enemy/world art remains below the requested contemporary production target.
Short native frame sample was confounded by focus pauses; no sustained combat FPS
claim. Human difficulty/feel, 5–10 minute pacing and Windows remain unverified.
No Git remote or deployment target; local commit/app are the delivery.
