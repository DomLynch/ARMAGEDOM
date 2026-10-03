# London walkability audit — 2026-10-03

Audited the current Westminster, south and east images for connected street-level roads and pavements. Broadened all three saved road boundaries and fitted solid-prop blockers to their ground footprints. This includes Westminster's lower/right pavement beneath the controls HUD, south's station approaches and gate lanes, and the east bridge pavements.

26 surveyed locations now have clear connected access; 20 were previously outside the road or blocked. The clearance survey allows 0.52m from boundaries, accounting for the player capsule. Real keyboard movement sweeps passed for Westminster (54.87s), east (59.09s), and south (60.14s). Each also proved a solid prop and river boundary remain physically blocked. This is surveyed coverage, not a claim that every painted pixel is navigable; stairs, raised platforms, wrecks, sandbags, buildings and water remain excluded.

The south candidate initially failed the existing blocker coordinate validation. Its northern blocker footprint was clipped to y=0.205; runtime validation was preserved and its actual movement sweep then passed.

Saved layouts are active in Game/Assets/StreamingAssets/London/Travel. The original images, depth masks, camera, scale and combat runtime are unchanged. Before layouts are preserved under art/london/areas/walkability-audit-20261003/before. No World client build was needed.

Open Builds/Play-London-pilot.command. Press R for a fresh Westminster run, or leave and re-enter an area to load its new layout. Native screenshot shows Westminster Wave0/100HP; native traversal of the new paths remains owner review. Lead explicitly owns the next combined full sword/world gate, including actual east/south exit travel, avoiding a duplicate full test run here.

Receipt: artifacts/walkability-audit-receipt.json. Repeatable geometry check: python3 art/london/areas/walkability-audit-20261003/check_candidates.py. Candidate layouts, survey locations and real-input route packet remain beside that script; three Audit* tests are in Game/Assets/Tests/WalkabilityAuditTests.cs. Future edits should update the matching route packet and verify live source hashes before claiming coverage.
