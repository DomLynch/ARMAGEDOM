import test from "node:test";
import assert from "node:assert/strict";
import { createStageAhead, validateStageAheadData, STAGE_AHEAD } from "../src/engine/stage-ahead.js";

function clock(extra = {}) {
  const t = { now: 100_000, fight: false, travel: false, frames: [] };
  const gate = createStageAhead({
    now: () => t.now,
    raf: (fn) => (t.frames.push(fn), t.frames.length),
    caf: () => {},
    fighting: () => t.fight,
    traveling: () => t.travel,
    ...extra,
  });
  return { t, gate };
}

test("the shipped limits validate and are frozen", () => {
  assert.equal(STAGE_AHEAD.enabled, true);
  assert.ok(Object.isFrozen(STAGE_AHEAD));
  for (const [key, bad] of [
    ["sliceMs", 99],
    ["skipFrameMs", 5],
    ["recheckMs", 1],
    ["exitRangeMeters", -1],
    ["enabled", "yes"],
  ])
    assert.throws(() => validateStageAheadData({ ...STAGE_AHEAD, [key]: bad }), /Invalid stage-ahead data/, key);
  assert.throws(() => validateStageAheadData({ ...STAGE_AHEAD, extra: 1 }));
});

test("the gate stays shut during the start delay, then opens", () => {
  const { t, gate } = clock();
  gate.enter();
  assert.equal(gate.open(), false);
  t.now += STAGE_AHEAD.startDelayMs + 1;
  assert.equal(gate.open(), true);
});

test("a fight shuts the gate until the quiet time after it has passed", () => {
  const { t, gate } = clock();
  gate.enter();
  t.now += STAGE_AHEAD.startDelayMs + 1;
  t.fight = true;
  assert.equal(gate.open(), false);
  t.fight = false;
  t.now += STAGE_AHEAD.fightQuietMs - 10;
  assert.equal(gate.open(), false);
  t.now += 20;
  assert.equal(gate.open(), true);
});

test("travelling never opens the gate", () => {
  const { t, gate } = clock();
  gate.enter();
  t.now += STAGE_AHEAD.startDelayMs + 1;
  t.travel = true;
  assert.equal(gate.open(), false);
});

test("a frame over the skip limit closes the gate for one check; frame timing is sampled only during a run", () => {
  const { t, gate } = clock();
  gate.enter();
  t.now += STAGE_AHEAD.startDelayMs + 1;
  gate.begin();
  const tick = () => t.frames.at(-1);
  tick()(1000);
  tick()(1000 + STAGE_AHEAD.skipFrameMs + 5);
  assert.equal(gate.open(), false, "long frame skipped");
  assert.equal(gate.open(), true, "the next check is open again");
  gate.end("completed");
  assert.equal(gate.stats().completed, 1);
  assert.equal(gate.stats().skippedFrames, 1);
});

test("the start check is throttled to recheckMs", () => {
  const { t, gate } = clock();
  assert.equal(gate.due(), true);
  assert.equal(gate.due(), false);
  t.now += STAGE_AHEAD.recheckMs + 1;
  assert.equal(gate.due(), true);
});
