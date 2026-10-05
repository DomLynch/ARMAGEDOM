# Beginner supplies art — 2026-10-05 Dubai

Ready for bounded integration after targeting029. Base accepted028 `938a9f1b926bd27c2a42c3ee17e7e8c2b083d194`; branch `codex/armagedom-supplies-art`. Integrate only NEW `Web/src/supplies-view.js`; supporting evidence is under `art/supplies-view/`. No existing runtime files changed.

Current helper SHA256 `38acf005c39e2c30c55949c2394a4a542b752c6674a4b55f948299fbd257321e`.

## API

```js
import {createSupplyView} from './supplies-view.js';
const view = createSupplyView({kind:'ammo',count:3}); // count 1, 2 or 3
// or createSupplyView({kind:'dressing'})
scene.add(view.root);
view.root.position.copy(world.toRender(drop.pos));
view.update(existingVisualTimeSeconds);
// collection / area unload / game destruction:
view.dispose();
```

Caller owns kind mapping from Combat's rules, world placement and lifecycle. Factory returns root/update/dispose, creates no timers and alters no resource/game state. Repeated dispose is safe; subsequent update is inert. Each view owns its geometry/materials/instance buffers, including shared-within-view details; disposal releases each once. No new texture/model downloads, dependencies, lights or shadow passes. Original Three.js primitives authored here.

Ammo has two instanced batches, 1–3 worn brass rounds. Dressing is a dirty off-white packet with muted printed cross/seams. Proxy scales are intentionally enlarged (ammo1.6, packet1.35) to improve small portrait visibility without changing camera. Packet centerY.025 prevents the enlarged box sinking below ground. Faint amber floor ring radius.275m, opacity.115–.205, depth-tested/depthWritefalse, y.012m. Existing world occlusion should apply normally; actual drop placement/foreground overlap remains integration review.

| Visual | Draw calls | Triangles | Owned geometries / materials / instanced buffers |
| --- | ---: | ---: | --- |
| Ammo1 remainder | 3 | 96 | 3 / 3 / 2 |
| Ammo2 | 3 | 144 | 3 / 3 / 2 |
| Ammo3 | 3 | 192 | 3 / 3 / 2 |
| Dressing | 4 | 108 | 3 / 4 / 2 |

Two ammo3 drops plus dressing: at most10 added calls/492triangles. Each visual footprint including ring .55m square; envelope height ammo .0608m/dressing .050625m. These are component costs, not measured phone FPS.

## Evidence and limits

Final queued VPS `/srv/dev-jobs/job-input-e8852fc62970`, bash run.sh,12 input files verified,7.01s EXIT0. Three0.182.0, Playwright1.61.1, Chromium1234 SwiftShader. `proof/request.json` binds all inputs; original helper digest0ceac80d…942805 matches that submitted source; current change only expands accepted ammo counts. `proof/resource-check.json` proves ground bounds, counts, bounded pulse, independence, invalid input rejection and exact once-only resource disposal. `proof/capture.json` records0page errors, no remaining supply roots and London renderer memory geometries4/textures2 both before/after disposal. Baseline warms Three's renderer-owned PBR DFG LUT; the helper creates no textures. `proof/supplies-006.png` personally inspected: neutral enlarged details and selected006393×852 London, ammo left/dressing right. They remain small at game scale; actual phone readability needs owner/device review.

Earlier failures retained: job9e91815c0269 resource checks passed but browser baseline omitted first-use renderer DFG LUT; job238e38e7d80b corrected warm-baseline capture passed on older size. jobafc40817b764 caught enlarged dressing box below floor before capture; current centerY fix passes. Final receipt supersedes these for current source, without converting failed jobs to passes. Final run.log is empty because checks go to checks.txt and successful browser capture is silent.

This is isolated art proof, not actual kill/drop/pickup/reward/HUD/save/Retry or served-game proof. WebUI owns authoritative integration and normal-input checks after029; Combat owns supplies.js/rules. No main game build/full suite repeated for this standalone helper; integrated candidate must complete required Web gate. Vest remains separate and unimplemented here. No paid HF/Tripo/GPU used.

## One-round successor seam

Lead found Combat collectSupply can leave one round after reserve-cap partial collection. Factory now accepts ammo count1/2/3; initial drop tuning remains2/3. WebUI maps a pending DTO as `createSupplyView({kind:drop.kind === 'rounds' ? 'ammo' : 'dressing',count:drop.remaining})`, using `drop.position` for placement. Recreate/dispose the visual when remaining changes; do not change resource state in this helper.

Only validation broadened; geometry/material/placement math for2/3/dressing unchanged, so original portrait/disposal receipts are reused for those cases. New one-round focused resource/count/ground/pulse/disposal check passed on queued VPS `/srv/dev-jobs/job-input-f779ed5981c2`,13verifiedinputs,3.01s EXIT0. Exactly two instanced batches of count1,3calls96tri, independent materials and once-only disposal. Current digest bound in proof/one-round/request.json; resource-check/result/checks-one saved there. No new capture/fullgate/build. `review-template/check-one.mjs` reproduces only the new case; general check.mjs now includes it for future review.
