// Stage-ahead: while the player is near the exit to the nearest neighbour area and nothing is fighting, that
// neighbour's destination preparation and graphics (stage, actor views, shader compile, warm) run in idle slices
// instead of inside the travel pause. If it finishes, the area is ready and the later travel skips both phases.
//
// The limits live in stage-ahead-data.json; `?stageahead=0` turns the whole thing off.
import input from "./stage-ahead-data.json" with { type: "json" };
import { closed, freeze } from "./content-schema.js";

import { finite } from "./shared-checks.js";
export function validateStageAheadData(value) {
  const d = structuredClone(value);
  closed(d, [
    "version",
    "enabled",
    "exitRangeMeters",
    "startDelayMs",
    "sliceMs",
    "skipFrameMs",
    "fightQuietMs",
    "recheckMs",
    "warmGroupObjects",
  ]);
  if (
    d.version !== 1 ||
    typeof d.enabled !== "boolean" ||
    !finite(d.exitRangeMeters, 1, 200) ||
    !finite(d.startDelayMs, 0, 30000) ||
    !finite(d.sliceMs, 0.5, 8) ||
    !finite(d.skipFrameMs, 16, 100) ||
    !finite(d.fightQuietMs, 0, 10000) ||
    !finite(d.recheckMs, 16, 2000) ||
    !Number.isInteger(d.warmGroupObjects) ||
    !finite(d.warmGroupObjects, 1, 64)
  )
    throw TypeError("Invalid stage-ahead data");
  return freeze(d);
}
export const STAGE_AHEAD = validateStageAheadData(input);

// The gate: open only when the page is quiet. `fighting()` is true while any enemy is alerted or the player is
// down; the gate then stays shut for `fightQuietMs` more. A frame longer than `skipFrameMs` closes it until
// the next check, so a struggling phone gets no extra work.
export function createStageAhead({
  limits = STAGE_AHEAD,
  now = () => performance.now(),
  raf = (fn) => requestAnimationFrame(fn),
  caf = (id) => cancelAnimationFrame(id),
  fighting = () => false,
  traveling = () => false,
} = {}) {
  let enteredAt = now(),
    quietAt = 0,
    lastFrameMs = 0,
    lastFrameAt = null,
    frameId = null,
    nextCheckAt = 0;
  const stats = { runs: 0, completed: 0, aborted: 0, holds: 0, skippedFrames: 0 };
  function tick(t) {
    if (lastFrameAt !== null) lastFrameMs = t - lastFrameAt;
    lastFrameAt = t;
    frameId = raf(tick);
  }
  return {
    limits,
    stats: () => ({ ...stats }),
    // Arrival in an area: restart the quiet period.
    enter() {
      enteredAt = now();
    },
    // Throttle for the per-step "should a run start" question.
    due() {
      const t = now();
      if (t < nextCheckAt) return false;
      nextCheckAt = t + limits.recheckMs;
      return true;
    },
    // True while the gate is open; also the place where a fight pushes the quiet time forward.
    open() {
      const t = now();
      if (fighting()) quietAt = t + limits.fightQuietMs;
      if (traveling()) return false;
      if (t < enteredAt + limits.startDelayMs || t < quietAt) {
        stats.holds++;
        return false;
      }
      if (lastFrameMs > limits.skipFrameMs) {
        stats.skippedFrames++;
        lastFrameMs = 0;
        return false;
      }
      return true;
    },
    // Frame timing is sampled only while a run is going.
    begin() {
      stats.runs++;
      lastFrameAt = null;
      lastFrameMs = 0;
      frameId ??= raf(tick);
    },
    end(outcome) {
      if (outcome === "completed") stats.completed++;
      else if (outcome === "aborted") stats.aborted++;
      if (frameId !== null) caf(frameId);
      frameId = null;
    },
  };
}
