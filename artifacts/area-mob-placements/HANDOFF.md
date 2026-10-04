# Six scattered Hollow placements — 2026-10-04

Prepared from accepted Three020 `751ad4799be64615ad2affca0ee0cb529d9cd769` in owned isolated manual worktree `worktrees/world-mob-placements`, branch `codex/armagedom-world-mob-placements`. Native worktree creation was unavailable (Business task cwd is not a repository); confirmed repository-local path ignored before manual creation. Other checkouts untouched.

Runtime intake is ONE NEW file: `Web/src/area-mob-spawns.js`, export `AREA_MOB_SPAWNS`. Frozen mapping area → two records `{key,pos:{x,z},patrol:[{x,z},{x,z}]}`. All coordinates use registered world metres, +x right/+z forward. Latest agreed WebUI shape; no alias module, loader or navigation framework. Stable key identifies the parked area actor. Westminster records are only two extra singles; retain the existing opening three separately (5/2/2 current-area caps). Do not seed extra roamers before the opening spawn rule, which currently refuses when any enemy exists.

| Area | Painted position | Patrol | Purpose |
| --- | --- | --- | --- |
| Westminster 1 | .23,.48 | 2 m right | Left street/pavement, about20 m from player spawn |
| Westminster 2 | .82,.45 | 2 m right | East approach road, about23 m from player spawn |
| East 1 | .30,.53 | 2 m right | Open bridge road, clear of return/entry throat |
| East 2 | .65,.36 | 2 m right | Far-side open road, clear of buildings/crates |
| South 1 | .58,.45 | 2 m left | Upper main road past entrance |
| South 2 | .46,.74 | 2 m right | Lower open road, separated from upper single |

Collision checks PASS against exact unchanged registered layout hashes. Actual Hollow descriptor bodyScale1 gives radius .4. Each spawn and full2 m patrol segment is clear at .55 (extra .15 m margin); sampling every .1 m plus polygon-edge line checks. All six are connected to every existing entry in their area using a .5 m grid with each traversed edge validated at actual .4 radius. East entry itself does not have .55 clearance, so connectivity uses actual .4 rather than misreporting the entry as invalid. This is a data/collision check, not new navigation code. West singles >15 m from opening spawn and pistol at both patrol endpoints; pair spacing33.05/22.29/14.10 m. All endpoints outside existing exit trigger rectangles; entrances at least6.65 m from each start. Bridge remains a combat road, with actor .4 radius on wide open ground, not a solid blocker across the corridor.

Run from worktree root: `node artifacts/area-mob-placements/check.mjs`. Lightweight deterministic validation, no asset loading/build/capture/paid compute. `receipt.json` pins source data/layout hashes and results. One production data file only; checker/receipt are delivery evidence.

Runtime later on accepted clothing-contrast base, owned by WebUI: use Combat's bounded wake/chase/leash recommendation so distant singles do not all join the opening fight. Existing AI immediately chases and has no wake/leash; data alone does not fix that. Preserve per-area deaths/health/positions/timers, player/pistol/stamina/camera/atmosphere and explicit Retry semantics. World made no runtime/layout/art/atmosphere changes. Integrated ordinary-input crossing/return/patrol/count/kill/reset proof, review/publication and physical-phone acceptance remain pending. No live encounter claim.
