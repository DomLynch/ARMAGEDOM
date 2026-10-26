import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateCommanderSession } from "../src/engine/game-data.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// engine/commander/session.js 7 to 0 (value-identical): the frame clamp (0.1 s, used twice), the 6 steps per frame, the 0.045 pan step
// (each way), the 8 px drag threshold and the 5 s bound on the test step API moved to data/commanderSession.json. The session needs a
// canvas and a renderer, so the old values are pinned here from origin/main (1286b716) and the source is checked to read them.
const text = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const raw = () => structuredClone(JSON.parse(text("../src/data/commanderSession.json")));

test("the data holds exactly the numbers the session used to hold in code", () => {
  assert.deepEqual(GAME_DATA.commanderSession, {
    schema_version: 1, maxFrameSeconds: 0.1, maxStepsPerFrame: 6, panStep: 0.045, dragThresholdPx: 8, maxApiStepSeconds: 5,
  });
  assert(Object.isFrozen(GAME_DATA.commanderSession));
});

test("the session reads every number from the data row (no literal left to drift)", () => {
  const src = text("../src/engine/commander/session.js");
  for (const use of [
    "Math.min(pacing.maxFrameSeconds, Math.max(0, (ms - lastFrame) / 1000))",
    "steps++ < pacing.maxStepsPerFrame",
    "Math.min(pacing.maxFrameSeconds, steps / 60)",
    '["commander-pan-left", -pacing.panStep, 0]',
    '["commander-pan-right", pacing.panStep, 0]',
    "> pacing.dragThresholdPx",
    "seconds > pacing.maxApiStepSeconds",
  ])
    assert(src.includes(use), use);
});

test("the loader refuses missing, extra and out-of-range numbers", () => {
  const broken = (mutate) => () => { const d = raw(); mutate(d); validateCommanderSession(d); };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { delete d.panStep; }));
  assert.throws(broken((d) => { d.extra = 1; }));
  assert.throws(broken((d) => { d.maxStepsPerFrame = 0; }));
  assert.throws(broken((d) => { d.maxStepsPerFrame = 6.5; }));
  assert.throws(broken((d) => { d.dragThresholdPx = 0; }));
  assert.throws(broken((d) => { d.maxFrameSeconds = 0; }));
  assert.throws(broken((d) => { d.maxFrameSeconds = 2; }));
  assert.throws(broken((d) => { d.panStep = "0.045"; }));
  assert.throws(broken((d) => { d.maxApiStepSeconds = 61; }));
});

test("the gate counts 0 in session.js and the baseline entry is gone", () => {
  assert.equal(countNumberLiterals(text("../src/engine/commander/session.js")).count, 0);
  const baseline = JSON.parse(text("../../scripts/as-data-baseline.json"));
  assert(!("engine/commander/session.js" in baseline.numberLiterals));
});
