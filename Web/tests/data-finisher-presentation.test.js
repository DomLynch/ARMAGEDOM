import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateAppearance } from "../src/engine/game-data.js";
import { finisherVictimPoseAge } from "../src/finisher-presentation.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// finisher-presentation.js loses its tuning numbers: the pose emphasis, the bake clock, the neck stump and its cap, the head's throw and bounce,
// the hit shove and the moment the cut opens are appearance.json `finisherPresentation`. The table is every literal the module held before.
const OLD = {
  poseEmphasis: { share: 0.25, window: 0.2 },
  clockMs: 4,
  clockEvery: 8, // was (i & 7) === 0
  stumpBand: 0.008,
  stumpRadius: { min: 0.005, max: 0.15 },
  cap: { thickness: 0.003, segments: 12, color: "#49251f", triangles: 48 }, // was 0x49251f
  headMaxVertices: 24000,
  runThroughMax: 1.25,
  headThrow: { out: 1.6, up: 1.8, spin: 6 },
  lastPhase: 0.999999,
  hitShove: 0.1,
  shoveClearance: 0.2,
  cutStart: 0.045,
  crownOpenSeconds: 0.12,
  gravity: 9.8,
  maxSteps: 6,
  bounce: { restitution: 0.22, friction: 0.65, spinDamp: 0.8 },
  spinMin: 0.02,
};
const rawAppearance = () =>
  structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/appearance.json", import.meta.url))));

test("every value equals the literal it replaced", () => {
  assert.deepEqual(GAME_DATA.appearance.finisherPresentation, OLD);
  assert(Object.isFrozen(GAME_DATA.appearance.finisherPresentation));
  // The defaults that now read other blocks are the numbers they replaced.
  assert.equal(GAME_DATA.appearance.crownSplit.maxVertices, 100000);
  assert.equal(GAME_DATA.appearance.finisherOpened.maxVertices, 300000);
  assert.equal(GAME_DATA.appearance.actorView.defaultDeathSeconds, 2.4);
  assert.equal(new Set([0x49251f]).has(parseInt(OLD.cap.color.slice(1), 16)), true);
});

test("the victim pose age is the old expression at every age", () => {
  const old = (age, enabled, restored) => (enabled && !restored ? age - 0.25 * Math.min(0.2, Math.max(0, age)) : age);
  for (const age of [-1, 0, 0.01, 0.1, 0.2, 0.21, 0.5, 2, 30])
    for (const [enabled, restored] of [
      [true, false],
      [true, true],
      [false, false],
    ])
      assert.equal(finisherVictimPoseAge(age, { enabled, restored }), old(age, enabled, restored), `${age}`);
  assert.equal(finisherVictimPoseAge(0.3), 0.3 - 0.25 * 0.2);
});

test("the loader rejects broken blocks", () => {
  const broken = (mutate) => () => {
    const d = rawAppearance();
    mutate(d.finisherPresentation);
    validateAppearance(d);
  };
  assert.throws(broken((p) => delete p.gravity));
  assert.throws(broken((p) => (p.extra = 1)));
  assert.throws(broken((p) => (p.cap.color = "brown")));
  assert.throws(broken((p) => (p.cap.segments = 2)));
  assert.throws(broken((p) => (p.stumpRadius = { min: 0.2, max: 0.1 })));
  assert.throws(broken((p) => (p.bounce.friction = 1.5)));
  assert.throws(broken((p) => (p.maxSteps = 2.5)));
  assert.throws(broken((p) => (p.lastPhase = 0.1)));
  assert.doesNotThrow(broken(() => {}));
});

test("finisher-presentation.js keeps no tuning number and the baseline no longer lists it", () => {
  const text = fs.readFileSync(new URL("../src/finisher-presentation.js", import.meta.url), "utf8");
  assert.equal(countNumberLiterals(text).count, 0);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url)));
  assert.equal(baseline.numberLiterals["finisher-presentation.js"], undefined);
});
