# Vagrant on the 106-joint Mixamo rig (28 Oct 2026, Art lane)

Output: `Web/public/assets/appearances/vagrant-106.glb`, 915,092 bytes, sha256 `ac6ca36481d9ada6cf5c8f61389ae0ba58f2422b5cc176ca59043e5e5231dbe3`, manifest model `vagrant-106` (deferred, appearance only).

## What it is and what it is not

The lossless vagrant mesh (`Web/public/assets/lossless/vagrant.glb`, sha `2fa34a82...`, 19-joint WardenRig, 36,924 triangles) re-skinned onto the 106-joint skeleton of `hunters/hunter-pitborn-106.glb`, playing that hunter's 16 donor-knife clips (Armed, ArmedWalk, Run, Attack, Return, Riposte, Heavy, Guard, Roll, Hit, Death, Parry, BlockImpact, Deflected, StrafeLeft, StrafeRight). Names and durations equal the hunter's, which equal the donor's, so nothing the code ties to a clip changes. No shield clips exist in this set.

**It is not wired into the player.** The in-game model key `vagrant` is the donor warrior (`donor/warrior-phone.glb`, hero rig): it is the player avatar. Pistol mount (`pistol-pose.js`, `attachPistol`), `equipDonorPlayer`, vest view, finisher code and the procedural low/dog/cleaver clips all read hero bone names (`hand_r`, `spine_01`, `pelvis`). The pilot report (PR #381) located the bone-name risk in `motion.js`, which only serves the unused lossless path. Swapping the player is a separate job. So no gameplay path selects `vagrant-106`; the row is the same kind as `marked-hunter` (appearance only, `deferred: true`), rollback is deleting the row.

## Pipeline (CPU only, VPS `/srv/dev-jobs/art-rig106/`, `run.sh`)

1. `gltf-transform copy` decodes the vagrant and the hunter GLB.
2. `build-vagrant106.py ... lean` (derived from the pilot's `build106.py`): vagrant limbs re-posed to the template's bind pose, the template's nodes and rest rotations kept, joint positions refit to the vagrant's, weights mapped vagrant joint to mixamorig joint, only the 19 weighted joints are skin joints (lean), 21 tracks per clip. Rotation tracks copied verbatim. Hips translation: rest offset plus (track minus template rest) times the leg ratio 0.9634.
3. Machete: removed from the skin, baked as plain meshes `WeaponDrawn_1/2` under `WeaponDrawn` under `fk_socket_hand_r`, in the socket frame the Pitborn cleaver uses (grip at origin, blade +Y). Weapon local bounds x -0.05..0.04, y -0.07..0.55, z -0.06..0.05 m.
4. `gltf-transform resize --width 1024 --height 1024`, then `meshopt --level medium`.

Sizes: raw lean 10.56 MB, 1k 2.40 MB, packed 0.915 MB (16 WebP textures at 1024). Triangles 36,924, 6 skinned meshes plus 2 weapon meshes, 35 nodes. Licence: Mixamo, cleared by Dom 2026-10-23.

## Manifest numbers

`scale` 0.92 (mesh top 1.94 m, about 1.78 m after scale), `stride` 0.988 (hips 0.98 m over the donor hero's 0.992, an estimate like the hunter's), `upperBone` / `headBone` rows as the hunter.

## Stills (375 wide, 3x, `stills/`)

In game (Westminster, the marked-hunter slot temporarily pointed at this row in a throwaway dist; VPS vite build, Mac Chromium headless): `vag-idle-full`, `vag-run-full` (chase), `vag-death-d15-crop`, `vag-death-d30-crop`. Viewer, vagrant left and hunter right, same clip and time: `cmp-armed`, `cmp-run`, `cmp-attack`. Attack is viewer only; the in-game attack driver was not run.

## Not verified

Physical phone (load, pacing, look), feel, foot slide at stride 0.988, in-game attack and hit, finger shape (hands stay rigid with splayed fingers because the vagrant has no finger weights), candy-wrapper at forearm and thigh in extreme poses, the armpit after the T-pose re-bake, machete edge facing, any player-side use.
