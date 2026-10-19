# Narrow173 gameplay adapters

Only `waitSimulation`, `aimAt`, `equipPistol` and `moveToPoint` are maintained
exports. The static policy pins the exact module SHA, these exports, and only
the `predicate` identifier evaluated inside the reviewed wait implementation.
No consumer input callback is approved; weaponAction retains its own separate
press/release contract. No legacy scenarios import, process launch, code-string
execution, alternative route planner or whole-module trust is added.

`waitSimulation(page,predicate,arg,{seconds,wallMs,label})` polls an inline
read-only predicate and actual game clock with independent finite wall/simulation
limits. It returns `{jsonValue,dispose}` with the observed value, preserving the
existing consumption API (not a remote JSHandle). Time reset without the requested
acknowledgement fails. A successful travel predicate may acknowledge an area
change with its new clock. No game field is changed by this helper.

`equipPistol(page)` requires live simulation and visible/menu-closed, unpaused,
walkable state. The current173 registered pickup must already be collected or
within its actual1.3m pickup radius in its registered area. It observes an already
selected pistol without dispatch, or sends ordinary G once, then requires the
actual Pistol family/collected/equipped acknowledgement. G is released on failure.
The1.3m prerequisite and G binding were checked against173's weapon-catalog.js,
pistol.js and maintained scenarios.mjs; this is not a generic weapon adapter.

`aimAt(page,id)` requires the selected Pistol and one actual alive/visible target
in the current area. It uses the existing FEET projection, ordinary mouse move,
and observes the actual visible ready Pistol cue bound to that id. This is target
readiness, not a shot/damage or changed-facing claim. Existing weaponAction owns
shot start/resource/result checks. A missing target/weapon rejects before input.

`moveToPoint(page,normalizedArtworkPoint,{mode:'touch',seconds:8,wallMs:25000})`
reuses the safehouse172 controlled-boundary drive's inverse-camera mapping,
46px radius,13% deadzone, near-goal speed reduction,.24m arrival threshold,
180-sample limit and touch id71. Only touch is supported. Each sample checks
live readiness and walkable footprint/target; the real pad must be visible and
hit-testable. There is no route search or obstruction workaround.

Successful movement returns `REACHED_BY_ORDINARY_INPUT` or
`AREA_CHANGED_BY_ORDINARY_INPUT`, with before/after/samples and `started`.
An already-reached point with `started:false` is observation only. Consumer must
assert the expected actual area for travel; an area change is not goal arrival.
TouchEnd and CDP detach are bounded finally operations, including dispatch
failure; release failures remain errors. No input is blindly resent.

The focused Node tests exercise the real helpers against a controlled DOM and
Playwright transport fixture. Static tests cover exact imports/exports, callback
input bypass and helper tampering. These prove no actual browser movement,
pickup, aim, fight, travel, phone or173 publication. Web owns consumer/observer
and the single required native scenario; Deploy owns launcher/submission.
