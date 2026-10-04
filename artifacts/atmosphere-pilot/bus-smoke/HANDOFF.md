# Bus smoke visibility correction — 2026-10-04

Dom accepts live016 fires; bus smoke is still too hard to see. Bounded correction on World32553d1: warmer grey bus-only tint, opacity .12→.65, width .019→.023, rise .043→.065. Three slow puffs, no bus flame or ember. Roof anchor/depth and all five accepted fire anchors/flame/ember shaders unchanged. Other smoke retains exact previous RGB .095/.085/.075. No new textures/draw calls/lights/audio/clock, camera/layout/main untouched.

Integrate ONLY Web/src/atmosphere.js, Web/src/atmosphere-westminster.js and focused test into current accepted runtime. QA capture adds close-up only. Preserve newer peer changes; do not merge this older baseline wholesale.

Evidence: VPS web-259d3aff7330 capture exit0,91 input files,19.02s, five landscape/portrait views, no page/console errors,26 quads/3 effect draws. Inspected bus-close-enabled vs baseline: warm grey plume visible above roof. VPS web-fe59e0a12f66 four focused realThree tests PASS including bus smoke-only/tint isolation, exit0/3.01s. Receipts and screenshots under visible/. Earlier contrast/final captures retained locally as rejected subtle passes; only visible/ is final candidate.

Registered fixture evidence; actual integrated runtime/publication and phone readability remain runtime-owner checks. Source alone is not live. No change to approved fire demo.
