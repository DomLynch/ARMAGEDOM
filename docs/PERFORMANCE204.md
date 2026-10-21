# Entry-only offscreen preparation204

The matched203/candidate check targets actor/finisher work observed after loading
while playing: the earlier receipt recorded1.64 CPU seconds over8 wall seconds
and an individual56.7ms preparation step. This is a measured source of main-thread
work, not proof of the reported physical-phone slowdown's cause.

Neighbours remain queued and cached. Cold actor/finisher CPU preparation is admitted
only for the urgent destination during the already-announced entry loading pause.
Existing ready destinations remain ready. Only the destination is prepared; other
neighbours stay queued when play resumes. Rendering, actor quality, effects, combat,
203 navigation, original Shelter waypoints, inventory and save codecs are unchanged.

The public loaded-session prepareArea API returns immediately for an already-ready
area. A cold request outside announced travel rejects before queue/state changes;
it cannot silently hang or begin background work. Actual activation announces
travel first, then uses the existing preparation/compile/warm/fence/commit path.
Cancellation, retry and stage lease ownership remain enforced.

Only the parked scheduler change is adapted here. The separate tutorial analytic
clearance and hunter prewarm ideas are not included. Validation/publication/device
acceptance are separate receipts under ARMAGEDOM-performance204-evidence-20261021.
