# Marked hunter wears the Pitborn (27 Oct 2026, Art lane)

Dom's word via Lead: the hunter's model becomes the Pitborn (Mixamo minotaur on the 106-joint rig, the body Frankendom v3 fights). A model swap on the existing hunter role: not a new enemy, not a new area. Draft PR, not merged, ships only after Dom's stills and phone test.

## What changed (data plus two one-line, default-preserving code reads)

- `Web/public/assets/hunters/hunter-pitborn.glb` replaces `hunter-goblin-l8.glb` (kept in git history for rollback).
- `manifest-hollow.json` `marked-hunter` row: new url, `rig: "pitborn"`, `scale` 1, `stride` 1.0273, plus two new bone-name rows, `upperBone` and `headBone` (`mixamorig:*`). The clip roles (idle Armed, walk ArmedWalk, run Run, slash Attack, return, stab Riposte, heavy, guard, dodge Roll, hit, death, parry, block BlockImpact, deflected) are unchanged: the Pitborn's clip names are the hunter's.
- `donor-motion.js` reads the upper-body bone from `description.upperBone` (default `spine_01`); `engine/boss-label.js` reads the head bone from `description.headBone` (default `head`). Without the second, the HUNTER label disappeared above the Pitborn (found in the in-game still). Every other model is unaffected.
- `Web/tests/marked-hunter-appearance.test.js`: re-pinned (rig name, and the L8 helmet/Face node asserts became Pitborn skeleton and cleaver-socket asserts).
- Not touched: the hunter's mechanics (hp, speed, radius, reach, damage, spawn and "always on" rules). The hunter is an appearance-only layer over the hollow actor (`actors.js`: "the hunter keeps its existing mechanical rig and rules"), and no humanoid hit surface is bone-bound, so reach and hit surface do not move.

## How the GLB is built (`build-hunter.mjs`, gltf-transform, CPU, VPS)

Start: OpenTrident `minotaur-106-v3-web.glb` (sha 214eaa44...). Keep the skeleton, bind pose and skin untouched; keep the 16 clips the hunter plays (drop Idle, Walk, Jog, Draw, Kick, ArmedRun and the eight finisher/death variants, which the hunter never plays); drop the empty `Layer_*` gear nodes; bake the Pitborn cleaver (`weapons/pitborn-cleaver-phone.glb`) under `fk_socket_hand_r`, which carries the 65-rig WeaponDrawn grip frame, as a node named `WeaponDrawn`; meshopt. No cut pieces, no `piece_*`/`cap_*` nodes, no physics, no special clips: the plain web body, so nothing pink flashes.

## Numbers against the current hunter

| | now (goblin L8) | Pitborn |
|---|---|---|
| GLB bytes | 2,861,704 | 1,211,976 (-58%) |
| triangles | 70,542 | 48,257 (44,278 body + cleaver) |
| skin joints | 65 (7 skins) | 106 (1 skin) |
| clips | 25 | 16 |
| height in the Armed pose (model units) | 1.254 | 1.542 |
| CPU, mixer + skeleton, 24 instances running Run (Mac, headless Chrome, no GPU draw) | 0.66-0.72 ms/frame | 0.37-0.38 ms/frame (about -45%) |

- **Clip timing:** all 16 clip durations are identical to the goblin's (Run 0.667, Armed 1.667, Attack 1.0, Hit 0.333, Death 2.4, Roll 1.467, ...), so every time the code ties to a clip (`posePhase`, death duration, response ticks) is unchanged.
- **Size in the world:** at scale 1 the Pitborn is 23% taller than the goblin hunter and still shorter than the player (vagrant 1.885 raw); the game applies the same `characterScale` (1.265) to both. Its physical footprint in the sim is the hunter entity's radius, unchanged. If Dom wants more menace, `scale` is one manifest number (1.15 would match the vagrant's height). Roofs and doorways per area were not checked.
- **Weapon mount:** the cleaver rides the right hand through `fk_socket_hand_r`; visible in the in-game and viewer stills. The hunter's strikes are timed from the data windows and the clip, not from blade geometry, so no blade-contact bake is needed for it (the blade-path bakes in `knifePaths.json` belong to the hero and goblin enemy rigs).
- **Stride:** 1.0273 is the Pitborn's clips' retarget height factor (V3's hips factor) times the hero's stride of 1. Not checked for foot slide in motion.

## Checks

- VPS, branch `b3b51137`: 448 tests across marked, hunter, donor, boss, label, actor, hollow, budget, manifest and area-boss files, 448 pass, 0 fail (includes the re-pinned appearance test, the deferred-load tests and the always-on tests).
- In-game stills at 375 px, 3x, Westminster, same fake clock and seed: `stills/game-before-goblin-hunter-crop.png`, `stills/game-after-pitborn-hunter-crop.png`, `stills/game-after-pitborn-hunter-full.png`. Model-viewer: `stills/model-armed-old-vs-pitborn.png`, `stills/model-attack-old-vs-pitborn.png` (old left, Pitborn right).
- The in-game stills use a scratch driver (`hunter-still.mjs`) that flags the nearest enemy as a marked hunter and holds it still; not game code.

## Not verified

- Physical phone: look, frame pacing, load of the deferred model. No Dom phone test yet.
- A live hunter attacking, being hit, dying and guarding in game (clips and timing are identical by measurement, but I did not run a fight).
- Stride and foot slide while it chases; the appearance against other areas' lighting.
- Full `verify_web` gate and CI: only the test subset above ran.
- The hunter now reads as a bare minotaur (V3's body has no armour, Dom's own rule). A colour or tint pass is a data choice, not done.

## Rollback

Revert this PR: the old GLB, row and tests come back together.
