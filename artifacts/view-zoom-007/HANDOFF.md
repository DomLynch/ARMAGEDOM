# Optional view zoom — 007 comparison

Lead contract: `createWorld({...existingOptions, viewZoomMultiplier: 1.15})` for007.
Omit the option for006. Constructor accepts the same option; default1 is exact
existing framing. Multiplier must be finite and >=1, preserving finite painting
coverage. Applied after adaptive follow and portrait70px crop calculation, before
aspect correction/clamping of the crop centre. No change to calibrated camera,
actor scale, layout, art, collision or masks. LoadArea retains the multiplier.

Existing landscape base1.3365 x1.15 =1.536975 at the reference depth; adaptive follow
still adjusts it with player position. Portrait final crop also x1.15, so actor
pixel height grows15% relative to the same actor settings. Character-only006
multiplier is Lead/Character scope, not changed here.

42/42 world-web lane checks pass. New tests first failed for missing zoom and
factory carryover, then passed: three orientations/two depths, default identical
projection, exact15% actor and all backdrop/mask projected displacements, viewport
coverage, fixed calibration/angle, pick roundtrip, identical collision movement,
constructor/factory/atomic load carryover and invalid options. Factory/load tests
stub image/network transport only; actual Three.js geometry/projection used.

Two owned source/test files plus this receipt; no build/Unity/deploy/main edits.
Real rendered007 browser/phone and owner visual comparison remain Lead gates.
Existing untracked dependencies and donor source artifact preserved, not staged.
