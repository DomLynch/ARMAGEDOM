# Crooked Hollow same-rig pilot — 2026-10-05 Dubai

Accepted027 base `79f88419e28a53e4f792edf5b94eb48b329f41b5`, isolated `worktrees/crooked-hollow`/`codex/armagedom-crooked-hollow`. NEW `Web/src/crooked-hollow.js`, `Web/tests/crooked-hollow.test.js` and `art/crooked-hollow/` evidence only. No existing actors/donor-motion/combat/module, GLB/model/rig/texture/material or gameplay changes. Exact SHA/bytes are in receipt.json. WebUI integrates the stable existing placementKey subset (proposed West3+5/East3+6/South4+7) after its current checkpoint; no extra residents/positions/counts/controls.

## Why a reversible overlay

Compared cloned gait tracks against a reversible evaluated-pose overlay. Track offsets can fold the spine but gravity-directed dangling arms and shortened steps with floor targets would need foot/arm baking separately for each gait. The chosen wrapper computes these against the same evaluated native rig, then restores EVERY modified position/quaternion before calling the next native sample/update. No scales/binds/source clip arrays are written, root/colliders/world speed remain native. The exact body/knife are unchanged, not new exports.

## API — minimal selected-actor substitution

```js
import {CrookedHollowMotion} from './crooked-hollow.js';
const native = new DonorMotion(root,model,animations,description);
view.motion = isCrookedHollow ? new CrookedHollowMotion(native) : native;
```

Pass ONLY the existing private SkeletonUtils-cloned Hollow actor, after native knife mounting and source material cloning. Preserve descriptions, rig/contactRig, animations and all current tuning. Wrapper implements update(entity,time,dt), sample(name,phase,guardOverlay=false), dispose(), model and currentClip/currentPhase getters. It owns no meshes/materials/clips/textures, so existing actor resource disposal remains authoritative. Wrapper dispose restores pose and delegates once to idempotent native disposal.

Eligible presentation clips are HollowIdle/HollowWalk/Run/StrafeLeft/StrafeRight only. Positive spinal fold (.72+.42radians), asymmetric clavicles and low neck produce roughly horizontal torso/low head; evaluated arm chains point downward with a soft elbow bend. Pelvis lowered3.5cm, foot forward travel compressed to55%left/70%right while retaining native world-height and native foot orientation. Uneven support/step-phase remapping plus1.55×visual cycle yields shorter, uneven shuffled steps without editing actual speed. No roll/guard/attack/hit/death overlay. Native combat intentionally unfolds into the ORIGINAL pose with no custom blending/contact changes; visible transition is part of integrated review.

NoTick nuance: restore before native.update is deliberate here. If native returns without sample, cached native transforms are still restored, then the SAME cached visual cycle is reapplied; same-tick repeated updates do not accumulate, unfold, or advance gait (actual-rig regression passes12 repeats). Do not independently call restore after wrapper.update, or call native.sample behind its back. Use wrapper.sample for explicit review. All modified positions/quaternions are cached and restored, including pelvis/feet/arm chains; source scales remain untouched.

## Actual model evidence

`proof/idle-0.png`, `walk-0.png`, `walk-0.25.png`, `walk-0.65.png`, `attack-0.34.png`, and `proof/crooked-hollow.mp4`:6seconds/8fps actual textured original GLB+knife. Baseline and variant side profiles under matched light, plus baseline-left/variant-right in actual selected006 London portrait projection393×852 (scale1.265×1.3225). MP4 adds one empty pixel column for even encoding width. Captured model/weapon/skeleton, not concept paintings. Inspected idle/walk/contact views: materially deeper fold, arms hang near knees, existing skin/jacket deformation stays continuous; original knife is visible above ground in walking pose. Native attack frame restores identical baseline/variant contact pose. Lead viewed idle and provisionally accepted silhouette; integrated gait remains open.

`metrics.json`:same-rig eight gait samples head drop0.53093–0.53360m, maximum foot-Y difference0.00001443m against corresponding native sampled phase, right-hand height0.58983–0.64372m, lowest of the two existing blade contact probes0.34952m. These are root-scale1 measurements; probes are not exhaustive mesh/self-collision clearance.

Final focused7/7 PASS: exact restoration/deepfold, nonlinear continuous phase map, shortened foot travel/floor target, all source animation arrays unchanged/clone independence/root preservation/disposal, same-tick stability, native attack/reaction sampling, and all161 fixed-tick contact samples across Attack/Return/Riposte/Heavy via REAL native.update plus hurt/death transitions. Contact delta tolerance1e-10. See final-tests.txt/final-focused-result.json. First run failed a QA lowercase 'head' lookup (actual bone is Head), preserved remotely; corrected6-test run passed and captured, then concrete native-update/contact measurement concerns justified ONLY one additional7-test/metric run, not another render/full suite. Helper bytes unchanged across successful capture and final checks.

VPS three-slot/five-thread queue: `/srv/dev-jobs/job-input-4103b842bbb1`49.03s exit0; final focused `/srv/dev-jobs/job-input-a5d313acfc91`4.01s exit0. Source+proof recovered here. No paid job, new asset generation, publication or standalone full suite. Review-template contains capture inputs; staged minimal job-input retains exact helper/DonorMotion/GLB/knife/world dependencies and npm Three0.182.0/Playwright1.61.1 (temporary QA dependency, no game package change). Do not nest wrappers on reproductions.

## Acceptance still required

The video samples gait in place; calibrated London scene is an art comparison, not normal input/world travel. WebUI's ONE compiled normal-play pass must show the actual selected reachable resident moving at game scale alongside baseline, stable placementKey selection on area return/Retry, ground/weapon clearance and native attacks/reactions/death. Check abrupt fold-to-native attack transition, stale-clock/menu lifecycle and subset-only CPU overhead. No phone/FPS/feel claim from this art proof. Reuse unchanged027 populations/route/body/weapon receipts and avoid duplicate broad checks. Lead/Auditor/Deploy own final integrated gate/package/acceptance/default publication.

Three supplied PNGs were inspected for posture only; source caption/diagnosis/likeness is not copied. The linked video could not be fetched by the web tool; gait is an authored interpretation of the approved posture, not reconstructed motion capture or a medical assertion.
