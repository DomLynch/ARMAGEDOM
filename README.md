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
- V: pause and inspect the real hero close-up; left/right arrows orbit. V returns.
- Mouse wheel: adjust gameplay zoom.

## Keep it small

Ten runtime files in `Game/Assets/Scripts`: arena construction, run flow,
player, enemy, health, combat effects, pickups, HUD, cosmetic skeletal animation, and paused hero inspection. No backend or multiplayer.
Gothic art uses original Blender ruins, CC0 scanned stone, and an original reconstructed Warden plus credited Flare enemy sources. No paid cloud jobs were used.

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

## Original HD Warden
The hero uses an original reference and TRELLIS.2 reconstruction, 4K PBR maps,
a custom 19-bone skeleton and authored animation. See `art/hero/README.md` for
provenance, source files, reproducible CPU conversion and current limitations.
The free shared-GPU runs consumed included quota: zero overquota usage verified.
No paid asset or paid HF Job. The CPU32GB tier alone cannot execute TRELLIS.2.
