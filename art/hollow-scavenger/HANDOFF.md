# Hollow Scavenger — one art pilot, 2026-10-04

READY for Lead's candidate/group integration, not Dom art approval, production or phone acceptance. Authoring base21b7c4ae220124bdd7eaf06e00ae08cfb54e5f51, character-web. Only new paths within the assigned Hollow scope changed. Current runtime is read-only Lead5dc5610 reference; no merge/rebase/reset or old donor/player modification.

## Decision and source fit

Rejected the existing modern Vagrant as the first motion base: its separate19-bone rig exposes only Idle/Run/Attack and no native hurt/death or supported hero knife sweeps. Retargeting it would be a larger, less certain project. Chosen existing normalized human donor `donor/warrior.glb`, sourceSHA d8aeb2ae0eb5c4b8b9dfa0813d04a41f17623d3d85b5702cd9494967b7fe9769, from pinnedFrankendom303af39e. Existing separate supported knife retained with its native hand_r binding and Heavy/DeathQuietOne overrides. No new base/image generation, HF job, GPU compute or paid spend.

## Candidate and integration descriptor

`Web/public/assets/hollow-scavenger/manifest.json`, models['hollow-scavenger']:
- Render rig **hollow-scavenger**, contactRig **hero**, bodyScale **1**. Native human knife paths, never Goblin paths. motion donor-knife reuses existing DonorMotion; no new renderer path/damage code required.
- Model `hollow-scavenger.glb`, SHA **b309eeb508a1c31babbfeaf13275ace3f54990dab380ae719c0d5881416f89fc**, **4,114,032bytes**. Separate knife.glb **382,956bytes**, source-identicalSHA b2f84216c0e3958391a84d72d174a70e474ee2af0a808632d1ad36b8c061bfec. Pair **4,496,988bytes**.
- Metres, forward+Z, forwardCorrection0, scale1, stride1. Embedded native [.9,.97,.97] root scale and [0,.025,0] offset retained. Apply common1.265 and visual1.3225 exactly as current Lead renderer does, once each; retain selected camera1.3365 and scene1.
-65source bones, original binds/rest hierarchy, native combat motion and native knife composition. Exact names/durations and hashes are in descriptor. Native Attack/Return/Riposte/Heavy/Guard/Hit/Death/Roll/Parry/BlockImpact/Deflected retained, no unavailable hurt/death clips and no fake parity. New HollowIdle/HollowWalk and affected Run change spine/neck rotation only; SourceRun remains available. Leg/hip/foot samples retained. All attack/contact timelines remain source-exact.
- Use existing SkeletonUtils clone + equipDonorPlayer and DonorMotion path. Descriptor equipment.url is relative to the standalone manifest. Lead owns actors/main/combat/loader integration and group behaviour.

## Art and budget

Living fictional aggressive affected survivor: lowered head/spinal slump, uneven upper-body nod in native walk, torn charcoal jacket, worn tobacco trousers, dirty boots and native hooked scavenged knife. Armor/heraldry/ornaments/wraps removed from the candidate only. The jacket reuses fitted weighted source torso cloth with irregular cut hem; sleeves/trousers are deliberately simple body-surface material partitions with grime vertex colour. This is a common-mob budget treatment, **not a full interchangeable player wardrobe or newly sculpted cloth detail**. No variants authored.

Body stored43,099triangles /6mesh nodes /9primitives /7materials /5images versus source60,581stored /13materials /34images. Equipped actual traversed candidate **46,293triangles /11mesh primitives /9material identities** versus equipped source **60,784 /17 /13**. Primitive counts are not measured GPU draw calls. Runtime/body photos remain at2048²(one),1024²(two),512²(two); knife uses its3source images. Candidate lowers stored/active asset costs; no encounter FPS or physical-phone memory claim.

## Actual moving proof

**hollow-moving-proof-v2.mp4** (12seconds,1260×440,8fps) and GIF show the exact written GLB, front atleft, side atcentre and current London camera atright. Idle, walking, slash, heavy, hurt and complete death samples;97actual renderer frames captured,96encoded. Metadata/hashes in receipt.json and frames-v2/capture.json. Isolated art scene directly imports the read-only Lead world renderer/registered backdrop, selected camera/layout and actor factors, at420×440 portrait viewport; candidate position{x:2,z:-6}, camera follows referenceplayer{x:0,z:-6}. This is **moving exported-model art evidence**, not an integrated gameplay/group fight.

An earlier spawn-centred capture was obstructed by the existing lamp mask during some poses; that first capture remains locally preserved but is not the selected proof. v2 moves the art figure onto a clear part of the existing road without changing camera, backdrop, masks or any world data. Both studio cameras show full head-to-feet. Walking is an isolated gait loop; world-travel foot sliding/crowd contact still needs Lead's group review. No ground IK or altered damage has been invented.

Blender5.2.1 CPU reimport/save succeeded. `hollow-scavenger-review.blend` preserves a body-only editable reimport at HollowIdle; runtime knife remains the separate original part. Authoritative runtime is the written GLB plus knife/descriptor, not a fresh Blender round-trip export. Reproducible builder build.mjs preserves all source inputs and prunes unused buffers/images after candidate edits.

## Validation and remaining acceptance

- Khronos **0errors/7warnings** (fullvalidator.json). Inherited/generated tangent-space and unused-attribute diagnostics remain; no format-clean-material claim.
-4new real-GLB checks, **56/56total lane Node tests pass**. Source contact equality at everyfixedtick for Attack/Return/Riposte/Heavy, identical native combat clip timestamps/values, hips/legs/feet unchanged at5sample phases for eachaffectedidle/gait, descriptor/hash/source pin, medieval gear removal and lower geometry/material counts. Saved tests and inventory receipts. No broad build or Unity jobs.
- Lead next: integrate3–5shared copies with Combat's preset, real road travel/foot contact and native hero sweeps, all6inputs, guard/parry, stamina/exhaustion, readable wind-up/contact/recovery, group death/retry and current camera. Then portrait/landscape desktop and physical-phone acceptance/publication under a separate preview. Dom must still approve this identity/cloth quality; it is one review candidate.
- CC0 body/animation evidence comes from pinned donor build sources. Generated original head/material/knife service receipts remain incompletely traced, as disclosed for the existing approved reuse pilot. No new licensing clearance claim.

Reproduce locally: `node art/hollow-scavenger/build.mjs`; `node --test Web/tests/hollow-motion.test.js`; `npm test --prefix Web`. Optional local art review: `python3 art/hollow-scavenger/server.py`, open http://127.0.0.1:8876/art/hollow-scavenger/review.html. Server is loopback-only; no upload to a third party. Review/export helpers and Blender/PBR inventory are in this folder. Raw frames and superseded first proof remain locally ignored, preserving authoring without bloating the handoff.
