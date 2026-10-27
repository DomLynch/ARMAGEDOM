# 106-bone rig pilot: vagrant on the 106 Mixamo rig (27 Oct 2026, Art lane)

Branch `art/rig106-pilot`, draft PR, **not merged, not shipped, no game file touched.** Everything here is under `art/rig106-pilot/`.

## Verdict: GO for a lean 106 humanoid, with four named conditions

The vagrant is re-skinned onto the OpenTrident 106-joint Mixamo rig, plays six Mixamo clips unchanged (idle, walk, run, attack, hit, death), and costs the same CPU per frame as today's 19-joint rig when built the "lean" way. The other lossless humanoids that exist as files (orc, revenant, warlock; the manifest also lists a warlord with orc's exact size, but no such file is in `lossless/`) went through the same script with no changes and animate correctly. Conditions before it ships: (1) choose no-shield clips, (2) one small data-driven bone-alias change in `motion.js`, (3) a phone test, (4) the Mixamo/OpenTrident licence question (below) answered by Dom.

## Which humanoid, which variant, why

- **Pilot body: the vagrant** (`lossless/vagrant.glb`, 19 joints, "WardenRig"), as Lead suggested. All five lossless humanoids share this exact skeleton and clip set, so the vagrant proves all of them.
- **Variant: lean.** Same bone names as the 106 rig (so any Mixamo clip, sockets and `mixamorig:*` lookups work), but only the 19 joints that carry skin weights are skin joints, and only those plus their ancestors carry animation tracks (21 tracks per clip instead of 53). The full 106-joint build is also produced (`build106.py ... full`), but it is 4x the per-frame CPU for no visible gain, because the vagrant has no finger, twist or cloth weights to use the spare joints.

## What was built (all CPU, numpy only, `run.sh`; VPS `/srv/dev-jobs/art-rig106/`)

1. The vagrant meshes are re-posed from the vagrant's A-ish rest pose to the template's T-pose by skinning with per-limb rotations (arms, forearms, hands, thighs, shins, feet aligned to the template's limb directions).
2. The template is OpenTrident's `base-human-xbot-full-phone-mixamorig.glb` (106 joints, built from the same X Bot the Mixamo clips come from, so every clip plays without retargeting maths). Its node tree, rest rotations and scales are kept (the one-mold rule: only bone lengths differ). Mapped joints take the vagrant's joint positions, the rest are placed relative to their nearest mapped ancestor at that segment's length ratio.
3. Skin weights: vagrant joint to mixamorig joint (Chest to Spine2, Clavicle to Shoulder, UpperArm to Arm, and so on). Fingers, toes, twist and fk joints exist in the skeleton with zero weights.
4. Clips: rotation tracks copied verbatim; Hips converted into the body's frame (Rx 180) and its translation fitted so the feet stay on the ground (height affine from the leg-length ratio 0.875, travel scaled by the same). Idle, Walk and Run have their horizontal Hips travel removed (in place); Attack, Hit and Death keep it.
5. Machete grip: the machete is re-gripped into the template's drawn-sword frame in the right hand (rotated 70 degrees about the hand), otherwise the blade lies sideways.
6. Packed with `gltf-transform meshopt --level medium`; a 1024-pixel-texture variant with `gltf-transform resize`.

Clips used (OpenTrident `models/mixamo/clips`, one-handed sword and shield set, all tagged core/high): Idle `122990901`, Walk `122650901`, Run `122660901`, Attack `122960901`, Hit `122840901`, Death `123060901`.

## (3) Size report and phone-cost estimate

| | joints (skin) | clips | tracks/clip | GLB bytes |
|---|---|---|---|---|
| Current `lossless/vagrant.glb` | 19 | 3 (Idle 1.97 s, Run 0.8 s, Attack 0.6 s) | 57 | 9,535,240 |
| `vagrant-106-lean.glb` | 19 | 6 | 21 | 9,013,312 |
| 106 full (not committed) | 106 | 6 | 53 | 9,128,140 |
| `vagrant-106-lean-1k.glb` (textures at 1024) | 19 | 6 | 21 | 1,459,772 |

- 8,416,802 bytes of every file are the 16 WebP textures, copied byte for byte, so **the rig change itself is size-neutral to slightly smaller** (non-texture payload about 0.6 MB lean against about 1.0 MB now, with twice the clips). Caveat: `meshopt` medium quantises positions (lossy); the current file is the lossless candidate. Unpacked and decoded, old 10.53 MB against new lean 10.46 MB.
- The phone-light lever is the textures, not the rig: 1024-pixel textures cut the same model to 1.46 MB (look at `stills/run-old-vs-106-q34-1k.png` and `walk-106-q34-1k.png`, which are the 1k build).
- Triangles unchanged: 36,924 for the vagrant (orc/revenant/warlock are 98-102k, which is the real phone cost of those three and has nothing to do with the rig).

Per-frame CPU (mixer update plus skeleton update, 24 instances of the Run clip, headless Chrome on the Mac, no GPU draw, `bench.mjs`), median of three runs of 600 frames:

| | ms per frame, 24 instances | per character |
|---|---|---|
| current rig | 0.146 | 0.006 ms |
| **lean 106** | **0.147** | 0.006 ms |
| full 106 | 0.58 | 0.024 ms |

Lean is at parity. GPU skinning cost follows the vertex count and the 19 skin joints, both unchanged, so no GPU difference is expected. **Not measured on a phone**: this is a Mac CPU ratio only.

## (4) What breaks (found by reading the code and measuring, nothing changed in the game)

- **Bone names, one file.** Only `Web/src/motion.js` looks up humanoid bones by name (`Head`, `Hand.R`, `UpperArm.R`, `Forearm.R`, `Thigh/Shin/Foot .L/.R`, lines 102-206). 106 names are `mixamorig:*`. Fix: a small alias table in data (the manifest already carries `boneAliases`) so the code keeps logical names. The only other place is data: `finisherData.json` lists candidate anchor and pelvis bone names (`Hips`, `Spine`, `root`, ...) for finisher effects; add `mixamorigHips` and `mixamorigSpine` to those lists (data only). No other `Web/src` file names humanoid bones, so **hit surfaces are not bone-bound for humanoids and do not break**.
- **Weapon mount.** The machete is a skinned mesh weighted to the hand, not a socket, so it travels with the hand bone. `ActorMotion` measures the blade axis at runtime from the mesh tip and the hand (`motion.js:104-120`), so it adapts to the new grip. Unverified in game. The 106 sockets (`fk_socket_hand_r`, `SwordDrawn`) are kept in the lean file for later weapons; the weapon-view overlays that look for `WeaponDrawn` are untouched.
- **Combat timing tied to clips: mostly safe.** The sim never reads clip length: `posePhase` maps the data windows (wind-up share 0.45) onto the clip. The Mixamo attack is 2.33 s against 0.6 s, but its weapon-hand speed peaks at 0.48 of the clip against the 0.45 the game assumes, so the visual strike lands within a few frames of the sim's hit moment (measured with `impact.html`; the old clip peaks at 0.12 and the overlay hides it). Still needs a feel check on a phone.
- **Gait data.** Walk/Run cycle lengths change (Run 0.7 s against 0.8 s, different foot travel per cycle), so `walkStride`/`otherStride`/`fullRunSpeed` in `visual.json` need retuning, or feet will slide. Data only.
- **Death and hit.** The old rig has no Death clip, so the game uses `LOOK.defaultDeathSeconds`; with a Death clip (2.3 s) the corpse timing becomes clip-driven (`actors.js:531`). Hit is new and has no game hook. Both need a decision, not a fix.
- **Tests.** Tests and manifests that pin the vagrant's bytes, sha, bones and clip names (`manifest-lossless.json`) must be re-pinned with a reason (the fix-forward rule). Not run, since no game file changed.
- **Art limits of this pilot, all visible in the stills:** (a) the clips are the sword-and-shield set, so the left hand is held as if gripping a shield, which the vagrant does not have: pick one-handed no-shield clips (the library has them, a data pick); (b) the hands are rigid, so fingers keep the vagrant's splayed rest shape in every clip, because the vagrant has no finger weights: fingers need a weight transfer, a day of work, optional; (c) no twist bones means some candy-wrapper at forearm and thigh in extreme poses, not checked at stress poses; (d) the T-pose re-bake rotates the arms about 60 degrees, so the armpit and jacket shoulder are the first place to look on a phone.
- **Orc, revenant, warlock:** the script ran unchanged and they animate (see `stills/*-idle-106-q34.png`), but their weapons (a sword bar, a staff) keep whatever roll the minimal alignment gave them, so each needs its own grip fit. Not done.

## (5) Go/no-go and effort for the other humanoids

- **GO** for lean 106, conditioned on the four items at the top.
- **Other lossless humanoids** (orc, revenant, warlock; warlord if its file turns up): the build already runs on them in about 3 minutes each on the VPS, so the per-character work is the weapon grip fit and stills: roughly half a day each, 1.5 to 2 days for the set, plus a phone check.
- **Game side, one time:** alias table, manifest and clip rows, stride retune, death/hit decision, test re-pins: about 1 to 2 days including review. The existing procedural arm solver, feet planting and strike overlay keep working on the same bones.
- **Not assessed:** the donor humanoids (warrior, goblin, hunters, remote survivor, hollow scavenger, bosses). They are on other rigs and were out of the pilot's scope. Animals keep their own rigs, as ruled.

## Questions for Dom or Lead

1. **Licence.** OpenTrident's 106 bodies are marked licence "unconfirmed" in V2's `SOURCES.json`, and the clips are Mixamo's. This pilot ships none of the bodies (only the vagrant's own mesh on the template's skeleton) but it ships baked Mixamo animation. Who answers whether that is cleared for the game?
2. Which clips for the vagrant (no-shield)? That is an art pick, not an engineering one.

## Reproduce

`NAME=vagrant bash run.sh <results dir>` (needs the VPS and `Web/public/assets/lossless/<name>.glb`); stills `node still.mjs <dir with viewer.html and glbs> out.png "a=/old.glb&clipa=Run&b=/new.glb&clipb=Run&t=0.15&view=q34"`; CPU numbers `node bench.mjs <dir> <glb> Run 24`; strike timing `PAGE=impact.html node bench.mjs <dir> <glb> Attack 1 "mixamorig:RightHand"`. The Playwright and three.js 0.182 come from `~/Developer/frankendom-web/node_modules`.
