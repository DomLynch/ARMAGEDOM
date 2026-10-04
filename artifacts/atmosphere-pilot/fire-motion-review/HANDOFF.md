# Owner-corrected fire motion preview — 2026-10-04

Status: visual candidate only, awaiting Dom feedback BEFORE WebUI import/build.
Old014 candidate remains parked; no publication requested. Lead confirmed this
approach after direct Dom feedback, Strategy was consulted and aligned. Pistol
remains independent. Original source painting, routes, camera and audio unchanged.

Dom correction: burnt bus gets slight residual smoke ONLY. Fire motion belongs
to places where original Westminster painting already depicts fire. The first
near-invisible pass was rejected; intermediate bus-flame draft is superseded and
must not be integrated. Earlier quiet-pass screenshots are not current evidence.

Registered original-painting anchors (UVs): bus roof (.425,.287), no flame/embers;
tower breach (.756,.145); riverside wreck fire (.791,.594); fire drum (.778,.552);
Parliament base fire (.455,.254); western Parliament blaze (.348,.215).
Distant planes depth80, foreground anchors use their listed ground foot depth
minus .03. Existing calibration/crop/masks remain authoritative. The western
blaze coordinate was corrected by inverse crop mapping after frame review.

Original analytic turbulent flame shader animates tapered, curling flame bodies
and tips in five existing fire footprints; dark soot and restrained embers.
No borrowed video/assets, fire on new objects, bloom, lights, gameplay hazards,
background replacement or new audio context. 12 smoke quads + 5 flame quads +
9 embers = 26 quads, three draw batches, zero textures. Same lifecycle seam.

VPS web-710bf9ec4a5f: exit0, 91 input files verified, 76.04s. Three focused real
Three calibration/pause/disposal/reentry tests passed. MP4 and baseline/enabled
capture check both page and console errors; zero errors. MP4 is 8s, 16fps,
deterministic rendered review: original1s, bus2s, tower2s, riverside3s. This preview
is not live gameplay or device/FPS evidence. Same-camera PNG comparisons in results/.

Only approved visual feedback can trigger bounded runtime integration, affected
build gates, combat/pickup/phone checks, independent review and immutable release.
Do not treat geometric tests or this standalone render as those later gates.
