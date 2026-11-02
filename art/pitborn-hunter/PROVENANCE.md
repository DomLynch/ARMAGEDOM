# Pitborn hunter pilot (27 Oct 2026)

The marked hunter's body is Frankendom v3's Pitborn minotaur. Appearance only: the hunter keeps its mechanical rig (`hollow-scavenger`), hit surface, reach, attack timing and rules; only the model the actor view draws changes.

- Source: `frankendom-v3/src/assets/minotaur-106.glb` at revision `721fbdc9ab5bf32abdfb2f9ada53defce601811e` (Mixamo ch25 Minotaur, legal cleared by Dom 2026-10-23). Copied byte for byte to `Web/public/assets/hunters/hunter-pitborn-106.glb`, sha256 `ba000ad1...5ed6`, 2,407,576 bytes. No re-export, no edit.
- Left alone: the 106-joint skeleton and names (`mixamorig:*`), bind pose, the eight `piece_*` meshes and sixteen `cap_*` nodes, the 26 clips (each carries 65 channels, all on joints of this skeleton; nothing is mixed with another body's clips).
- Data changed (`manifest-hollow.json`, model `marked-hunter` and its `files` row): `url`, `rig` (`pitborn-106`), `scale` 0.95, `stride` 0.964, `starterHidden` (the sixteen `cap_*` nodes, hidden when the actor is attached, so no pink flesh patches), `measure`, `provenance`, `bytes`, `sha256`. Clip names are unchanged (Armed, ArmedWalk, Run, Attack, Return, Riposte, Heavy, Guard, Roll, Hit, Death, Parry, BlockImpact, Deflected), all present in the file with the same durations as the old Goblin hunter's.
- Rollback: set the three fields back from `provenance.previous`; `hunters/hunter-goblin-l8.glb` is still in the tree.
- Not used from Frankendom: the eight baked special/finisher clips (`src/assets/106/minotaur/`, V3 JSON), the physics measure file beyond the numbers in `measure`, the cut manifest, any ragdoll or Jolt code.

Still request for the Art lane: Westminster, the area where the hunter spawns on a marked-money warning; fight camera at 375 wide; ready idle, a mid-chase run, a mid-swing (`Attack`), and the `Death` pose, side by side with the old Goblin hunter at the same spot. Look for: pink or flesh patches at the shoulders, belt and neck (hidden caps), the empty right hand (no weapon is mounted), feet sliding on the run, head height against the roofs.
