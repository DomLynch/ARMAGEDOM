# One original pistol — Characters handoff, 2026-10-04

Review candidate for the authorised starting-area pistol V1. Isolated branch `codex/armagedom-pistol-art`, checkout `worktrees/pistol-art`, accepted012 base `fcec55be75160a48a07a2e2a68ef01b55d0b58a9`. Only new pistol paths; no original body, donor clip, Knife/Hollow, gameplay or camera edits. WebUI owns integration and Lead owns acceptance/publication.

## Exact files

| File | SHA256 |
|---|---|
| `Web/public/assets/pistol/pistol.glb` | `62d6bdc4789365ace89c98bc3fe74322ae427f316810f81cb4ad66857e73f321` |
| `Web/public/assets/pistol/manifest.json` | `a733ef6fb8624de420586fed2c048d14f19daee53f8effd2166f1c528c072904` |
| `Web/src/pistol-pose.js` | `7f800c6d3a4a68253adad3330280539d48a7f22527d581e254b70082054f0088` |
| `art/pistol/proof/pistol-moving.mp4` | `4209bd4fb791378143d1c504cf034de8933b67f6808545d9308b20fca20a0f32` |

GLB 106,436B, one mesh/three primitives/three materials, 1,364 triangles, no image textures, no skin or animations. Source `art/pistol/build.py` and `pistol.blend`. Entire pistol geometry/materials are original procedural authorship for this project: no external mesh, texture, branding, paid generation or commercial clearance dependency added. Existing review body is the already-authorised donor `warrior.glb` SHA `d8aeb2ae0eb5c4b8b9dfa0813d04a41f17623d3d85b5702cd9494967b7fe9769`; its older provenance limitations are unchanged.

## Runtime contract

Static part, not another character. Do not add to the startup roster. Load with existing loader when the pistol slice needs it; clone the same source for pickup/held representation. Actor-manifest equipment entry, if used by WebUI:

```js
{url:'pistol/pistol.glb',bytes:106436,sha256:'62d6bdc4789365ace89c98bc3fe74322ae427f316810f81cb4ad66857e73f321'}
```

Relative URL above assumes the existing `assets/manifest-hollow.json` directory. Final integrated manifest/pruning/closure belongs to WebUI/Deploy; no startup manifest changed by this handoff. Import helper from `Web/src/pistol-pose.js` through Vite, not by dynamically importing an unbundled public module with bare `three` imports.

GLB has `Pistol`, `Grip` and `Muzzle` names; metres, +Z barrel/+Y up. Grip origin0; Muzzle local `[0,.055,.161]`, +Z direction. Approximate physical envelope18cm long/3.4cm wide/15cm tall before selected actor-scale factors. It is a compact unbranded matte polymer/steel survivor weapon. Use part root as-is; no native knife rotation copied.

```js
const mount = attachPistol(privateClonedCharacter, pistolGLTF.scene);
// AFTER DonorMotion.update sampled native idle/walk/strafe/run each frame:
applyPistolAim(privateClonedCharacter, mount, {recoil: shotAge < .16 ? 1-shotAge/.16 : 0});
const muzzle = mount.getObjectByName('Muzzle'); // getWorldPosition for effects
```

Only apply while pistol-equipped, alive and outside dodge/hurt/death commitments. Suppress knife swing generation/sampling for pistol shots. Hide the weapon/skip overlay for roll/hurt/death; preserve those native clips and resume aim on completion. Sampling native motion next frame naturally restores affected bones when switching to melee. Keep held knife hidden while aiming and restore it on melee return. Dispose/release cloned mount/source resources through the existing actor lifecycle.

The helper drives the existing `upperarm_r`, `lowerarm_r`, `hand_r` and finger bones. It changes presentation rotations only: no rig/bind/root/leg/source-animation edits. A bounded two-bone arm pose follows character-local +Z; existing actor root must face explicit aim with `atan2(facing.x,-facing.z)`. Grip follows evaluated `hand_r`, with character-frame palm offset `[0,-.045,.13]`. Pistol render parent is the cloned model root to avoid inherited nonuniform armature scale; a fixed hand-local quaternion would reintroduce direction skew. Therefore use the helper rather than manually parenting this weapon with knife transforms. Read actual Muzzle world position; Combat remains the authority for domain ray/hit/ammo.

## Evidence and limits

Final viewport proof: `proof/aim-0.png`, `walk-0.25.png`, `walk-0.65.png`, `fire-0.png`, `fire-0.15.png`, `roll-0.4.png`, and3second8fps `pistol-moving.mp4`. Three panels show hand close-up, full-body side, actual selected006 London portrait projection. Same written final GLB, cloned existing donor, native walking plus pistol-specific aim/recoil; roll hides the held gun without freezing the arm. Inspected aim close-up: corrected palm/trigger/grip alignment; coarse donor hand/glove geometry remains a pilot limitation, not hero-quality finger animation. One-handed pose; left arm remains native. Source body stays medieval here; this weapon task does not remake player clothing.

`proof/capture.json`:16 actual-renderer checks (four headings × four gait phases), min aim dot1, maximum leg/foot drift0, zero browser errors. `validator.json`:zero errors/zero warnings. Mandatory Web gate passed231/231 on accepted012 plus this art candidate; `run.log`/`result.json` retain exit0 at remote `/srv/dev-jobs/pistol-art-16dc9428336f`,33.02seconds. Blender5.2.2CPU queue export exit0 (`blender.log`), separate owned job `/srv/dev-jobs/pistol-art-20261004`. Three-slot queue/five threads used; no paid compute. Early Snap launch failure and rejected hand-parent aim check were repaired and retained remotely, not called passes. No repeated unrelated build or publication.

Helper was captured at the provisional public path; it was then moved byte-for-byte to `Web/src/pistol-pose.js` for Vite bundling. Its exact SHA above is unchanged; review HTML now imports the final path. This path relocation does not invalidate the recorded geometry/pose images, but final integrated bundling remains WebUI's check.

No authored reload clip, slide cycling/ejection, left-hand support animation, bespoke gun hurt/death/roll animation, gameplay shot or pickup acceptance, FPS claim, physical-phone or served-release acceptance. Recoil is a small procedural weapon pitch; finite-ammo/reload/fire rules and sound are other owners' scope. London art proof holds position and samples gait: it does not prove moving world travel or normal-input pickup/fire. WebUI's integrated normal-input proof must check equip/aim/fire while moving, hide/restore under roll/hurt, actual Muzzle projection/reticle/ray coherence, melee return and lifecycle cancellation before release.
