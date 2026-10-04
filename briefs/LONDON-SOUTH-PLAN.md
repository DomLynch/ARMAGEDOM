# London south pilot — scoped execution

> HISTORICAL PLAN — NOT AN ACTIVE ENGINE OR DELIVERY INSTRUCTION.
> Superseded by [Three.js only and Unity retirement](THREEJS-ONLY-RETIREMENT.md)
> and TEAM-AND-REUSE.md. Preserve this record for provenance; do not run its
> Unity/native commands, gates, slot allocations or public-download instructions.
> Carry applicable art, gameplay and device requirements into Three.js.

Owner's repeated instruction: get the connector/pilot live and report when done.
Design: docs/superpowers/specs/2026-10-03-london-south-crossing-design.md.
Lead delegated end-to-end implementation to World, retaining integration oversight.
World executes inline. Main Char owns the Unity slot until its current gate/build ends.

## Constraints and contract

- Preserve original source PNGs, rigs, controls and legacy single-image startup.
- Fixed camera rotation, zoom1.65, characterScale1.265, followSeconds0.45.
- New world runtime is opt-in with `-london-world`; failure retains legacy stage.
- Two areas plus one connector; east remains source-only. No backend or new assets tooling.
- Existing Game/Assets/Scripts/{ArenaBuilder,HeroView}.cs and Tests/RunTests.cs belong to Main Char; do not edit.
- New files: LondonWorld.cs, WorldBackdrop.shader, WorldTests.cs, StreamingAssets/London/World/ content.
- Minimal shared changes only if necessary: RunManager world spawn selection; PlayerController movement after a won pilot.
- Source texture registration and static narrow seam blending are rendering work; no source image is overwritten.

## Measured choice

projection-probe.json records existing camera geometry and analytical foot/head sizing.
Extending the old fixed perspective crop over three image heights substantially
magnifies actors on southern ground. Test a common orthographic ground mapping
at the same camera rotation, calibrated to the original entrance actor's projected
height and foot pixel. This is a candidate, not an accepted camera conversion.
Native road/prop/actor perspective must pass before activation is called complete.

## Tasks and checks

- [x] Preserve originals/hash manifest; generate connector; overlay-review road/masks.
- [x] Reject V2 aspect/composition defect. Keep V1 as registration input.
- [x] Obtained bounded Unity slot; released back to Main Char07:42Z. Add real WorldTests using reflection for the missing component;
  run the focused test and observe failure because the world runtime is absent.
- [x] Implemented the opt-in common ground/texture mapping, continuous road union,
  destination decode/geometry validation before legacy deactivation, and cleanup.
- [x] Targeted2/2 checks passed: point registration, image coverage, original character scale, fixed
  rotation and actual CharacterController movement through both seams and back.
- [ ] Invalid destination remains in legacy mode; repeat trips retain actor identity,
  health/cooldowns and encounter counters. Test inspection/restart and mesh cleanup.
- [ ] Keep legacy full PlayMode suite and six sync tests passing. Build incrementally;
  require zero build errors and packaged smoke in legacy and pilot modes.
- [ ] Record native roundtrip using real movement code, camera/ground/mask checks and
  seam screenshots. Automated traversal is separate from human game-feel approval.
- [ ] Review latest shared diffs, then activate the tested native pilot. Update receipts
  and shared status with exact proof and remaining visual limitations.

Do not call unregistered texture juxtaposition seamless. If the common projection
or seam blending still fails the visible check, preserve that bounded failure and
correct the first defective art/registration stage; do not weaken acceptance.

## Visual gate — latest

Actual-engine seam captures rejected row-smear and UV stretch. One continuous
master rejected for altered protected positions and inadequate resolution. One
covered-passage alternative now reviewed statically: unchanged original panels,
separate textured deck across each full-width join, no warped source or fading.
Static concealment passes; native depth/grounding and continuous movement remain
unproven. Lead judge pending; no additional generation loops. See
art/london/areas/south-pilot-20261003/covered-passage-review.json and
artifacts/covered-passage-static/. Character lane retains Unity until explicit
release. Candidate remains opt-in/inactive; no new world live-build claim.
