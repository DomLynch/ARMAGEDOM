# Existing area route audit

Canonical82a54ab and this isolated lane have identical world source/layout content;
only lane manifest Westminster byte/hash record was stale after the prior numeric
camera tweak. No road/blocker fix needed: all three road polygons match the saved
portable audit. West/south differ only in previously approved zoom. East retains
extra crate/building exclusions and depth masks added after the audit.

26 existing landmarks reachable by actual radius.4 movement; four new corridor
checks reconstruct collision-clear routes from each manifest entry into each exit
trigger, execute every waypoint through geometry.move, verify destination entry
clearance and reject immediate return-trigger activation. Planning clearance.46.
All46 World lane checks pass plus syntax gate. No runtime/main/layout/camera edit.
Pinned non-engine reference JSONs preserved here; no archive/runtime dependency.

Lead must activate travelAt/travelTo in main, suspend movement/events while the
atomic async area load is pending, preserve fight state and check rendered
south/east roundtrips on the served candidate. Tests are geometry proof, not real
player-input or phone acceptance. Package all three existing layouts/backdrops.
