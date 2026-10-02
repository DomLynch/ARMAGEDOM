# Ashvault

A small local Unity desktop action RPG prototype. Mac development; platform-neutral C#.

## Play

Open `Game` in Unity 6000.3.25f1. Open `Assets/Scenes/Ashvault.unity` and press Play.
The standalone Mac build is `Builds/Ashvault.app` (no Unity Editor required).

- WASD: camera-relative movement; mouse: aim.
- Hold left mouse: slash. Right mouse: heavy strike.
- Space: dodge, with a short invulnerability window. 1: shockwave.
- Walk over gold/cyan/green pickups for damage, maximum health, or healing.
- Clear waves to open the next gate. Kill The Crownless in chamber four.
- R or the outcome button restarts immediately.

## Keep it small

Nine runtime files in `Game/Assets/Scripts`: arena construction, run flow,
player, enemy, health, combat effects, pickups, HUD, and cosmetic skeletal animation. No backend or multiplayer.
Gothic art uses original Blender ruins, CC0 scanned stone, and credited Flare character sources. No paid cloud jobs were used.

## Replace art

Each actor has a gameplay root (CharacterController, Health, controller) and a
`Visual` child. Replace that child's contents without changing the root or collider.
Use FBX exported from Blender for Unity's native import. GLB needs a glTF importer
or conversion in Blender; this prototype intentionally does not add one.
The imported rigs use Legacy Idle/Run/Attack clips; no Mecanim retargeting is required.
Aim is local +Z; world up is +Y; 1 unit is 1 metre.

## Verify

Play Mode tests are in `Game/Assets/Tests`. They test real Unity components,
including attack obstruction, invulnerability expiry, death/restart, and run progression.
The full-run test accelerates the simulation and kills enemies directly to test
progression; it does not establish difficulty, game feel, or a 5–10 minute human run.

Editor menu `Ashvault/Create playable scene` regenerates the minimal entry scene.
`Ashvault/Build Mac demo` produces the desktop app.

Run `python3 scripts/verify.py` for Play Mode tests (live Editor or headless fallback),
then `python3 scripts/smoke_mac.py` to launch/check the actual Mac build headlessly.
These commands are configured in `.quality-gate.json`. Stop Play Mode first.

The canonical status and known limitations are in `PROJECT_STATE.md`.

## Rebuild the art

`art/build_gothic.py` authors the ruins; `art/convert_flare.py` converts the credited
Blender characters and bakes muted albedo on CPU (four threads). Run either with
Blender background mode, then use `Ashvault/Import gothic art` in the editor.
The original source files, licenses, import metadata and texture receipts are retained.
`Game/Assets/StreamingAssets/ART-CREDITS.txt` and the upstream notices ship in the app.
The orc and ogre currently share a hobgoblin source at different sizes; this is a
small dark-fantasy visual prototype, not Witcher-level production artwork.
