# Westminster atmosphere candidate — 2026-10-04

**Superseded capture evidence:** the original c774d8f candidate had a GLSL
uniform precision mismatch. Its pageerror-only capture missed the shader console
error, so the original stills/profile below do not prove enabled effects. The
video check caught it before integration. Corrected capture now also fails on
console errors. See `video-review/` for replacement evidence when available.

Base: accepted012 `fcec55be75160a48a07a2e2a68ef01b55d0b58a9`.
Isolated World lane: `worktrees/westminster-atmosphere`, branch
`codex/armagedom-westminster-atmosphere`. No shared runtime, layout, backdrop,
camera, audio, actor or pistol files changed. This is not live or integrated.

## Integration seam

```js
import {createAtmosphere} from './atmosphere.js';
const atmosphere = createAtmosphere({THREE,scene,world});
// Existing RAF, after world.update and before renderer.render:
atmosphere.update(dt,{paused: paused || traveling || loading, enabled: true});
// Existing restart/teardown:
atmosphere.reset();
atmosphere.dispose();
```

Reuse the current mutable LondonWorld. No second RAF or audio context. The
module disposes geometry/materials outside Westminster and recreates one group
on reentry. Pause/disable freezes animation; reset clears phase without allocation.
Dispose is idempotent. No optional crackle included: existing donor audio has
combat cues, no reviewed matching fire ambience, and sound is not a dependency.

## Content and budget

Actual original painting inspected. Bus blackened roof anchor (.425,.287) gets
only dark smoulder, no invented flames. Tower's existing orange breach below the
clock (.750,.145) gets restrained smoke, glow flicker and two intermittent embers.
Fixed calibrated image planes remain registered under camera crop/scroll;
bus depth is .03 before the existing bus mask, tower depth80 is behind foreground
actors/masks and before backdrop100. Transparent effects retain depthTest and
disable depthWrite. No lights, shadows, bloom, hazards or replacement art.

Nine smoke quads + one flicker + two embers = 12 quads, three shared batches,
48 vertices, 72 indices, zero texture asset bytes. Analytic shader alpha and
finite lifetime phases; no particle spawning or per-frame geometry allocation.

## Evidence and limits

VPS `web-9cffaf391dea`: three focused real-Three tests passed (calibration under
cropped projection, pause/disable/reset, exit/disposal/reentry). Overall job exit1
because subsequent Playwright launch expected an absent browser version; this is
not reported as a successful overall job. `tests-and-browser-setup-failure.json`
and recovered test log retain that result. Capture setup retry used inaccessible
`/root` executable under runner user; final corrected installed `/opt` route used.

VPS `web-afb783b73da2`: capture exit0, 90 inputs verified, 16.01s. Results cover
spawn/bus/tower landscape, spawn/bus portrait, baseline/enabled frames. No page
errors. Viewed bus landscape, tower landscape and bus portrait enabled images.
Effects remain faint; distant tower can be cropped out as in the original camera.
These are isolated painting renders, not a gameplay proof.

Same landscape environment, 45 frames each: draw calls4→7. JS update+render
submission mean1.04→.813ms, p95 .70→1.30ms. This noisy short software-renderer
sample measures submission, not completed GPU work; no speedup/FPS or phone claim.

Unchanged route/zoom/sprint receipts reused. Remaining integrated candidate gates:
actual combat tells/player/pistol visibility in motion, pause/menu/travel hookup,
physical phone frame pacing/readability, independent review, mandatory affected
build gates, package closure and separate immutable delivery. Pistol must not wait
for atmosphere polish. Current012 stays live until reviewed activation.
