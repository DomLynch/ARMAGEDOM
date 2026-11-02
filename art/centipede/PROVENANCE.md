# Giant centipede (28 Oct 2026)

One new monster: a real giant tiger/house-type centipede, grounded for the 2030 realistic game (Dom's ruling, 28 Oct): flat segmented body, dull orange-brown, paired banded legs, two trailing legs, short forcipules folded under the head, no eyes, no glow, no horns or fantasy shapes. Believable size: the rig is exported at 0.6 so it is about 1.6 m long in game.
Everything is CPU (VPS, no GPU, no paid service, no donor asset, no AI model): `cycle.sh` (Mac) uploads and runs `run.sh` on the VPS, which runs
`atlas.py` (numpy and Pillow, procedural textures), `build.py` (Blender 5.2 headless) and `gltf-transform meshopt`.
Look history: a first pass was dark red-brown with large lobster-like pincers; changed to orange-brown, smaller forcipules, matte (roughness 0.5+), smaller overall, per the realism ruling.

## Rig and motion (no new engine code for motion)
- Source: the roach GLB with 30 fps clips (`Web/public/assets/roach/original-roach.glb` from the roach clip-fps branch, sha256 `c336864b...6c29`, 520,860 bytes; the roach built at 24 fps trims every clip by one frame). `build.py` sets the scene to 30 fps.
- The ARM_RoachRig armature is kept: 27 joints with their names, hierarchy, six clips (`roach_bite/death/hit/idle/run/walk`). The roach mesh is discarded.
- 48 joints are added (8 new leg pairs, leg/shin/foot) that copy the middle roach leg pair: same rest shape shifted along the body, same roll, same parent (`body`). The walk and run clips are re-timed along the body (a wave of one sixth of a cycle per pair); bite, hit, death and idle copy it unshifted so the legs curl together on death. The three original pairs take the same rest shape and wave (walk and run only).
- Result: 75 joints, six clips with the same names and durations as the source (0.6, 0.8, 0.3, 1.6, 0.4, 0.6 s). The model entry reuses motion kind `roach`, the clip names and the roach `roach_bite_scaled` attack clip.
- Foundation row `giant-centipede`: model scale 3 (armature node scale 0.6 inside the GLB), health 60, radius 1.7, speed 2.3, reach 1.9 (roach: 20, 1.59, 1.8, 1.61), low strike and calf bite like the roach (`biteMove roach`, `lowSwing roach`).

## Mesh and textures
- One skinned mesh `ARM Giant Centipede`, one material `Dark red-brown chitin` (name kept from the first pass). About 4.5k triangles, about 3,000 vertices.
- Body: 11 plates, each a dome with a stepped rear edge, tapering to a tail; head plate; 11 leg pairs; two trailing legs; two short forcipules weighted to the mandible bones (the bite clip moves them); two long antennae weighted to the antenna bones. No eyes.
- Textures (one 1024x512 atlas, ORM and normal 512x256, WebP in the GLB), procedural in `atlas.py`: orange-brown plates with a darker dorsal stripe and dark grooves, pale tan belly, banded tan legs, brown forcipules.
- Contact: the two canine vertices in the manifest are the most forward vertices weighted to each mandible bone (found by `viewer.html`); the player calf faces and band are the roach's.

## Pin
- `Web/public/assets/centipede/giant-centipede.glb`: bytes and sha256 are in `manifest-hollow.json` (`models.giant-centipede`), about 387 KB (budget 600 KB).

## Placement (data only)
- Area 8 (a wet ruined square; no area is underground). Slot assignment from the coordinator: spider Area 7, eel East, elephant Elephant and Castle, rat king Lambeth, so the centipede takes Area 8 (South's slot is a drone). It takes Area 8's one creature slot (`area8-resident-4`, which clears exactly a 1.7 m radius) in cycle B, replacing the dog there (a weak dog-class creature, 30 hp); cycle A keeps the roach. So it appears on every other run. `server/data/spawns.json` follows the live cycle A only, so it is unchanged and no writer spawns redeploy is needed for this change. Recipe `centipede-lurker` uses the `ambush` intent (sleeps until the player is within 2 m).
- Off switch: the crow's optional-monster mechanism: `optionalMonster`, `enabled: true` and `offParam: nocentipede` in the `giant-centipede` row of `creatures.json` `rigCapabilities`; `?nocentipede=1` (or `enabled: false`) puts the cycle A roach back in the slot (`populationPlacements`).
- Server: the payout guard test requires a seed row for every creature kind, so migration `20261028000023_arma_payout_giant_centipede.sql` (with a ROLLBACK line and `supabase/down/..._down.sql`, never applied) adds `giant-centipede` at 100. Gapless merge order set by the coordinator: elephant 000021, spider 000022, centipede 000023, rat king 000024. The db-drift migration-count pin is 23, assuming elephant and spider (000021, 000022) merge before this PR; until then the drift test on this branch alone sees 21 files and fails.
- Stills (375x812, Area 8, fake clock, headless Mac GPU): `stills/a8b-idle-crop.png`, `a8b-death60-crop.png` (death is the roach death clip: it rolls onto its back, shot 60 ticks in); model views `viewer-v6-q34.png`, `viewer-v6-top.png`. Legs and body were darkened and the legs made matte (roughness 0.7+) after review, so they no longer glow against the scene.

## Not checked
- Phone loading, frame pacing, touch feel and audio (no physical phone); desktop headless only.
- The ambush wake and the bite swing were not driven in the stills (the creature stayed asleep); the bite uses the roach contact data unchanged.
- No bespoke sound or death effect, and no gore row (like the wolf and salamander).
