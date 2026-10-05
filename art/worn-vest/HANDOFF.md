# ONE worn vest — art ready, 2026-10-05 Dubai

Isolated `worktrees/worn-vest-art`, branch `codex/armagedom-worn-vest-art`, accepted030 base `6bc3110f0fe0564fa5fdde58ab91a45c0e39ae84`. Integrate only NEW `Web/src/vest-view.js`; all other new files are art evidence. Original donor player/knife/pistol/world/rig/assets remain unchanged. No actors/main/effects/save/combat/reticle edits or paid service/model download.

Helper SHA256 `c3ac7f944ee1e0a0bd69b9cae47724253e36aa74e428cbd8a98ace532d064a08`.

## WebUI ownership and API

```js
import {createVestView,createVestBagView} from './vest-view.js';
// Original independently SkeletonUtils-cloned player, AFTER material cloning:
const vest = createVestView(playerModel); // attaches itself; initially hidden
vest.setVisible(equipped);
// Existing actor update: native motion -> any pistol aim -> vest update:
vest.update();
// Before actor/model source teardown:
vest.dispose();

const bag = createVestBagView();
scene.add(bag.root);
bag.root.position.copy(world.toRender(verifiedBagPosition));
bag.setVisible(eligibleAndNotEquipped);
bag.update(existingVisualTimeSeconds);
// collection / area unload / Retry / game teardown:
bag.dispose();
```

Both return root/setVisible/update/dispose. The vest root must remain under the original Gambeson parent; do not add it to the world scene or reparent into a bone. Build once per player, hide/show from the authoritative equipment DTO. Repeated disposal is safe; all methods after disposal are inert. If adding hit flash, register the existing owned cloth material without cloning/replacing it. Dispose the view before source actor traversal/teardown so its owned Skeleton is not accidentally handled as a donor source resource. Caller must release the old view on Retry/replacement.

No eligibility/save/protection/equip decision in the art helper. Combat owns the pure rules; WebUI alone owns placement/pickup/one atomic state/save/Retry integration. Bag position in proof is only an open-road QA placement (x1,z−3.5), not the required verified near-stash placement.

## Fitting and visual receipt

One faded grey-green cloth torso wrap, geometric dirty hem/grime shading and two short shoulder straps, fitted onto the actual original body. Native Gambeson/Steel/Heraldry/LeatherBody/Skin bind surfaces provide radial seating and interpolated original skin weights. Lower armholes avoid the upper arm geometry; short collar bridges span original surface openings with nearby native weights. Original geometry/materials/animations/bone transforms are read only. No reconstructed model, new texture, new rig or future wardrobe framework. Existing underlying outfit remains visible at neck/waist/limbs; this is one starter equipment overlay.

Chosen over rigid single/segmented bone panels because the fitted skinned overlay preserves seating through native spine bends/twists. It creates an owned Skeleton with the same original Bone references and copied inverse-bind matrices; dispose releases its own bone texture, never donor skeleton resources.

Personally inspected final neutral front/side/back and selected006393×852 London screenshots for Armed idle, ArmedWalk, Attack slash, Guard, Hit and pistol walk. Distinct muted cloth panel/straps, hands/weapons readable, no gross clipping observed in these frames. Back panel is deliberately broad and short; inherited source collar/waist details remain. The bag is small and restrained; actual discoverability at the near-stash placement and phone readability remain integration/owner review. No full-game or phone acceptance claimed.

| Added presentation | Geometry / material / skeleton | Draw calls | Triangles |
| --- | --- | ---: | ---: |
| Vest | 1 / 1 / 1 owned skeleton (65 borrowed bones) | 1 | 544 (342 vertices) |
| Bag + strap + amber ring | 3 / 3 / 0 | 3 | 72 |

Vest creates one renderer bone texture; no art texture downloads. Bag .34×.18×.24m plus strap, floor cue radius.34m/height.012m/opacity.115–.205. No timers, shadows or added lights. Costs are component counts, not phone FPS measurements. Existing player/movement/body scale and006 camera unchanged.

## Pinned checks, failures and evidence reuse

Actual original rig equipped with the native knife:65 samples (13 phases each Armed/ArmedWalk/Attack/Guard/Hit), finite deformed vest vertices/normalized weights, all65 bone positions and full knife matrix compared with baseline. Maximum numerical native difference2.220446049250313e−15; max generated edge stretch1.5201283378×. Native check completed in queued VPS `job-input-574a32c3c66c`22.02s; its wrapper remains EXIT1 at later disposal-baseline assertion (existing pistol geometry warmed only after baseline). `proof/pose-check/metrics.json`, request/result/run.log and exact `review-template/pose-tested-vest-view.js` preserve that scope.

Final helper differs from that tested helper ONLY by the cloth colour constant (8f8969→6e7770). `verify-colour-only.mjs` and raw `proof/colour-only.txt` establish identical fitting/weights/geometry/deformation logic; reuse those native numerical checks instead of replaying them. Final queued VPS `job-input-50f55fca76eb`,19verified inputs,24.02s EXIT0: final seven rendered views, warmed source pistol/renderer baseline, once-only owned vest geometry/material/skeleton disposal, hide/show/post-disposal safety, original scene retained and zero page errors. Renderer returns neutral20geometries/47textures and London24geometries/48textures exactly. Main source SHA matches final request. No integrated gate/build repeated for this standalone art component; WebUI integrated candidate needs its required gate and normal equipment pickup/effect/save/Retry evidence.

Earlier failed wrappers retained under proof/failures:9402ab ready timeout;27dbead identifies fitting miss;daa77af exact upper-side ray miss;898846 and30fc82 shoulder/collar misses;3d2f25 screenshot timeout after CPU pose checks. Repaired armhole/collar bridge, then stopped rendering every numerical sample to avoid filling the GPU queue. No numeric suite repeated after recovered574a pose evidence. Final source/render/disposal receipts supersede these without converting failed wrappers to passes.

Final images: `proof/Armed-0.png`, `ArmedWalk-0.25.png`, `Attack-0.34.png`, `Guard-0.png`, `Hit-0.5.png`, `Armed-0-back.png`, `ArmedWalk-0.5-gun.png`. Reproducible staged scripts/old-colour input under review-template. Heavy work used only the existing shared VPS queue; Claude untouched/Codex hooks off. Ready for sole WebUI integration; no publication here.
