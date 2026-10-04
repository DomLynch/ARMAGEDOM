# Warrior/Goblin knife pilot — Character handoff, 2026-10-04

READY for Lead integration, not served/game/phone acceptance. Base a2acec135ef4c85a6cb452f27042a8849b1268fa. Only donor assets, a new motion adapter, focused tests and CPU QA receipts changed. Front vagrant concept remains a separate canonical art reference; no Tripo/HF job or new generation in this delivery.

## Lead integration seam

- Load `Web/public/assets/donor/manifest.json` and its three relative GLBs. `models.vagrant` is hero warrior; `models.goblin` is opponent. Keep existing roster/manifest as rollback and enable this pair only with Combat's `pilot:'donor-knife'`.
- Clone every character scene with SkeletonUtils. For player only, call `equipDonorPlayer({scene:clonedScene,animations:player.animations},knifeGLTF)` before material ownership traversal. Function returns `{scene,animations}`, retains original hand_r local weapon binding and overrides Heavy/Death_QuietOne. It does not mutate cached GLTFs. Goblin keeps its own knife and clips.
- Construct `new DonorMotion(actorRoot,model,animations,description)` instead of legacy ActorMotion for descriptor.motion==='donor-knife'. `update(entity,game.time,dt)` consumes Combat swing `{clip,ageTicks,timing,sourceContact,end}`, response `{clip,start,ticks}`, dodgeStart/dodgeUntil, guarding, hp. No combat or damage calculation in adapter.
- Use existing heading `atan2(facing.x,-facing.z)` and world.toRender reflection. forwardCorrection **0**. Apply common actor scale **1.265 once**; descriptor scale **1** for both. Preserve embedded nonuniform root transforms: hero [.9,.97,.97], Goblin [.7515,.80995,.80995], both offset [0,.025,0]. Goblin stride **.7014** vs hero1. Combat's Goblin bodyScale .78 sizes capsules; never multiply visual root by it.
- Include Combat g.corpses when making visible entities. Pass actual visual dt while an encounter is finished so Death responses can complete with frozen simulation time; pass dt0 while menu/hidden/paused. Responses progress independently from dt after their first observation. No wall-clock timers or simulation mutation.
- Fresh swing/dodge supersedes lingering parry/block response. Combat must continue clearing swing on Hit/Deflected/death interruption. Source Role sampling at weight1 preserves the sweep; moving guard uses native gait legs with spine-descendant Guard tracks.
- Lead retains actors.js/main.js/package/lock/gate and full build/browser slot. No integration patch to those files is included.

## Six controls and contact timing

Slash alternates light_right/Attack and light_left/Return (14/6/16 ticks); stab thrust/Riposte12/4/20; heavy heavy_overhead/Heavy22/5/26; special skill_pommel/Skill_Pommel18/4/18 (close hilt cone, no blade path); dodge Roll36ticks; held guard Guard, responses Parry/BlockImpact/Deflected/Hit/Death. Source contact phase .34 for lights/thrust, .48 heavy, **.45 special**. `donorSwingPhase` remaps windup/contact using pinned source swingProgress, not generic .45 attack phase.

## Evidence

- Pinned read-only donor 303af39e97b758f50a84935eeb0cac6196fe98ae. Source/candidate SHA256 and normalization counts in manifest and receipts/candidate.json. One normalized derivative each; no rig replacement/retargeting.
- Candidate differs only in rotation output float samples and their accessor min/max. All other JSON fields and binary bytes verified unchanged: geometry, embedded texture bytes, binds, rest transforms, clip timestamps and names. Original format errors were non-normalized quaternion outputs; updating samples required updating their stale bounds. No repeated speculative mesh/rig repair.
- Written files hash-match the candidate used by CPU playback comparison. Khronos validator zero errors for all3; inherited warnings26 hero/31Goblin/0knife, including runtime-generated tangent-space concerns. This is not material acceptance.
- All10 knife path families sampled at every fixed tick for both own rigs against donor tables; max source table quantization error8.30e-6m and original/candidate knife delta0 at sampled frames. 171 clip poses: largest world vertex delta1.635e-7m, largest bone delta1.621e-7m. Full receipt quaternion-playback-probe.json. Not proof of every continuous pose.
-17 new Node tests use actual loaded normalized GLBs, not dummy rig mocks: four attack families on hero/Goblin at all four headings/common1.265scale, special/guard/dodge/reaction/cancel/death/mixer independence, moving-guard split and hashes. All52 tests pass; diff check clean. Tests fixtures are a focused byte-value extraction from the pinned per-rig knife tables; no gameplay implementation reuse hidden in tests.
-13,583,364 total GLB bytes, uncompressed. No load-time/performance claim. Medieval donor appearance is a combat compatibility pilot, not acceptance of the final contemporary vagrant outfit.

## Remaining checks

Lead matched London game-camera test: visible knife contact/grip, weapon normals/PBR, feet/guard movement, all6controls, hit/parry interruption, death/corpses/retry and portrait/landscape. Then physical-phone simultaneous touch/performance. Generated donor head/material/knife service commercial provenance receipts remain incomplete; CC0 body/animation sources are recorded in pinned intake/build scripts, not a complete licensing clearance.

CPU preparation: `node art/donor/probe.mjs`, `node art/donor/prepare.mjs`, `npm test --prefix Web`. QA scripts currently use the saved read-only intake and its existing validator install paths; runtime and tests have no dependency on the Frankendom checkout or those QA installations. No paid jobs/build/publish/Unity changes performed.

### Test portability repair — 2026-10-04

Lead reproduced an import-time saved-intake dependency in the QA helper. Fixed by moving intake reads and receipts-directory creation inside the direct-execution `main()` only. `node art/donor/check-portability.mjs` copies the real assets/adapter/tests/helper into a temporary standalone fixture with no sibling `character` lane, runs all17 motion tests in a subprocess, and verifies importing the helper creates no receipts directory. RED reproduced ENOENT before the fix; GREEN17/17 passed afterward. Active intake was never moved/deleted. Offline probe command retains its existing saved-intake workflow; runtime/assets/adapter behavior unchanged.
