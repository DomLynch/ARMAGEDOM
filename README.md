# ARMAGEDOM — Ashvault foundation

The owner is taking this prototype toward a grounded 2029–2030 post-nuclear ARPG.
The installed game still contains the original fantasy roster and room.
See [the handover](docs/ARMAGEDOM-HANDOVER.md),
[original narrative](docs/ARMAGEDOM-WORLD-BRIEF-SOURCE.md), and
[Mac/GitHub/VPS source sync](docs/SYNC.md).

A small local Unity desktop action RPG prototype. Mac development; platform-neutral C#.

## Play

Open `Game` in Unity 6000.3.25f1. Open `Assets/Scenes/Ashvault.unity` and press Play.
The standalone Mac build is `Builds/Ashvault.app` (no Unity Editor required).

- WASD: camera-relative movement with smooth turning.
- Left mouse: slash toward the cursor; hold for repeated attacks. Clicking never moves.
- Q or right mouse: heavy strike. Feet plant during swings; damage lands after wind-up.
- Movement and dodge face travel; Space can cancel a pending strike.
- Space: dodge, with a short invulnerability window. 1: shockwave.
- Walk over gold/cyan/green pickups for damage, maximum health, or healing.
- Fight revenants, orc executioners and plague warlocks in the same Outer Watch room; defeat the Orc Warlord.
- R or the outcome button restarts immediately.
- V: pause and inspect the real hero close-up; left/right arrows orbit. V returns.
- Mouse wheel: adjust gameplay zoom.

## Keep it small

Ten runtime files in `Game/Assets/Scripts`: arena construction, run flow,
player, enemy, health, combat effects, pickups, HUD, cosmetic skeletal animation, and paused hero inspection. No backend or multiplayer.
Gothic art uses original Blender ruins, CC0 scanned stone and original reconstructed Warden, Revenant, Orc and Warlock characters. Animation processing uses the authorized Hugging Face Pro 32 GB CPU tier ($0.03/hour); no paid GPU jobs.

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
progression; it does not establish difficulty, game feel, or human pacing.

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
The legacy Flare sources remain for provenance; the current arena uses the original
roster. The warlord shares the orc mesh at a larger size.

## Original HD Warden
The hero uses an original reference and TRELLIS.2 reconstruction, 4K PBR maps,
a custom 19-bone skeleton and authored animation. See `art/hero/README.md` for
provenance, source files, reproducible CPU conversion and current limitations.
The free shared-GPU runs consumed included quota: zero overquota usage verified.
No paid asset or paid HF Job. The CPU32GB tier alone cannot execute TRELLIS.2.

## Original 4K enemies
The current room has five mixed enemies, then six, then the Orc Warlord.
All three distinct enemy designs appear in the first wave.
Enemy wind-up animations signal attacks; player and enemy attack cones are removed.
Models, maps, rig reproduction and verification are recorded in `art/enemies/roster.md`.

`art/hero/refine_motion.py` refines the existing rigs without rebuilding textures.
The run covers 2.375m per full cycle; ArtMotion scales playback to actual travel.
Attack contact is normalized phase 0.45; gameplay wind-up and recovery control playback.
