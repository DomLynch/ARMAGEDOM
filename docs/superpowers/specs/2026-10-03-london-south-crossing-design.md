# London south-area pilot and continuous crossing

2026-10-03. Owner approved the map connections and requested implementation.
This written design records the runtime/art decisions for review; it is not a
receipt that travel or seamless artwork already works.

## Outcome and scope

Run from the existing Westminster street into the supplied southern street and
back, with continuous movement, camera following and grounded 3D characters.
No teleport, fade, whole-image dissolve, loading screen or game restart qualifies
as a smooth crossing. First review the standalone south pilot, then the crossing.
The eastern bridge remains the next area, after the first connection is accepted.
The eventual London map may contain50–100 images; this milestone builds two areas.

Preserve zoom1.65, characterScale1.265, followSeconds0.45, existing lighting,
fixed camera angle, controls, combat and original rigs. Gameplay period2029–2030.
Preserve Westminster source content byte-for-byte and retain a single-area rollback.
No paid GPU, new backend, networking or character-lane edits.

## Source receipts

All three supplied PNGs are1672×941; they are not3344×1882 masters.
Hashes identify exact originals before any candidate work:

| Area | SHA256 |
| --- | --- |
| Pic1 south | d2380a6ea7a922c9b0cec71c80ca718492a679c79c8a87474b06a7376d0e52de |
| Pic2 east | c059acad2a7e83b5cd776fa6f18463fd42ed113e02dd2f6ff29f6c82b5a946ec |
| Pic3 supplied Westminster | c96c5fffc9dfb63174be8a47c6e3aca0a245fb04b5262785c9e4b8f8e334fd30 |
| Existing game Westminster | 7ce686a7dd54b800261bb697b3e269f18cb2a72ca8ae5b7733a742ceab2c28e2 |

The existing game image was visually checked and matches the supplied composition;
different file hashes are not evidence of different decoded pixels. Keep the game
original as the rollback baseline rather than replacing it with pic3.

## Current constraints verified in source

LondonBackdrop renders one image and clamps its projection crop within that image.
TryApply rebuilds one road boundary and checks existing actors plus hardcoded
RunManager wave entrances before accepting content. Its polygon validator excludes
the upper20% of the image. South's top road entrance therefore needs deliberate
support, not merely another layout.json. RunManager implements one three-wave arena.
Saved-content reload is not a multi-area travel API.

CodeGraph found current stage source but also returned preserved Library cache
noise; a scoped Semble search and direct reads covered the missing source.

## Approach selection

1. Instant background swap: small code change, visible composition/position jump;
   rejected for the owner's smooth-exploration requirement.
2. Whole-image crossfade: conceals loading but ghosts scenery and changes location;
   rejected as continuous travel.
3. Registered adjacent image tiles plus an authored shared crossing strip: chosen
   pilot direction. Verify the art registration before committing to runtime changes.

The approved adjacency is Westminster bottom road to south top road. The images
have different compositions; edge alignment is unproven. Create a separate candidate
connector and adjust only candidate edge regions where needed. Do not stretch the
whole image to make roads meet. If fixed-camera registration cannot retain believable
scale and scenery, return the visual defect for correction rather than ship a jump.

## Content and runtime contract

Give each area a stable ID, source image, registration in shared world space,
walkable polygons, obstacle footprints, convex foreground masks, safe spawn points
and reciprocal connection IDs. Keep candidate content outside the active London
folder until reviewed. Author a clear central south-road lane around the bus, wrecks,
sandbags and barriers; all painted props remain static unless supplied separately.

Lead Dev owns the shared-world renderer, camera cropping across the combined extent,
connection loading and activation, encounter lifecycle, tests and client build.
Visuals/World owns candidate artwork, calibration, ground, obstacles and masks.
Use one shared collision/actor space at the crossing: changing area ownership must
not teleport or recreate the hero. Preserve health, cooldowns and facing. Track
encounter state per area; travel must neither reset nor duplicate Westminster waves.
Keep enemies safely constrained to authored encounter space for this pilot.

Preload the destination before opening its connection. Keep the current area working
if destination decoding or validation fails; never open a route into absent ground.
For later expansion, bound residency to the current area and directly connected
neighbours, releasing inactive textures and geometry. Do not load100 full images.
Keep inspection/restart and source reload explicit and regression-tested.

## Acceptance and next validation

First show the south pilot in Unity at the retained scale, with safe entry, enemy
spawn positions, foot contact, obstacle collision, masks and camera-edge coverage.
Owner reviews this pilot before its route becomes active.

Then record an actual native Westminster→south→Westminster run. Check road continuity,
constant actor scale, no blank pixels or image jump, no collision snag, correct
foreground masking and uninterrupted input. Repeat crossings without actor, wave,
texture or mesh duplication. Destination-load failure must retain the safe area.
Run the declared quality gates, packaged smoke and inspect build error counts.
Report source, tests, build and visible gameplay separately.

Next step: review this design, then write the scoped implementation plan. Lead is
currently catching up read-only; no coordination message has been sent from this chat.
