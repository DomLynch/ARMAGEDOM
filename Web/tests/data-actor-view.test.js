import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateAppearance } from "../src/engine/game-data.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// actors.js loses its tuning numbers: the damage flash, the blob shadow, the marked-hunter tint, the drone clocks, the contact bands and the hit,
// flame and fire/reload timings are appearance.json `actorView`. The table is every literal the module held before the move.
const OLD = {
  damageColor: "#831428", // was new THREE.Color(0x831428)
  shadowBlob: { size: 64, centre: 32, innerRadius: 3, outerRadius: 31, midStop: 0.55 },
  shadowScale: 1.25,
  shadowLift: 0.016,
  markedTint: [1, 0.66, 0.55],
  roachBiteScales: [3, 4],
  droneDeathSeconds: 0.8,
  droneWarningSeconds: 0.6,
  droneAttackLead: 1.4,
  droneAttackWindow: 0.12,
  defaultDeathSeconds: 2.4,
  huntArrivalShare: 0.5,
  rocketAimFallback: 0.05,
  rocketAimTargets: 32,
  finisherGeometryBudgetBytes: 128 * 1024 * 1024,
  footWeightMin: 0.85,
  toothVertex: 80,
  ratContact: [0.12, 0.52],
  footBand: [-0.01, 0.2],
  calfBand: [0.49, 0.54],
  hitFlashSeconds: 0.1,
  flashIntensity: 0.35,
  hitStepMax: 0.05,
  flameStepMax: 0.1,
  leanGain: 0.3,
  flinchGain: 0.1,
  fireWindowSeconds: 0.25,
  reloadClipSeconds: 2,
};
const rawAppearance = () =>
  structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/appearance.json", import.meta.url))));

test("every value equals the literal it replaced", () => {
  assert.deepEqual(GAME_DATA.appearance.actorView, OLD);
  assert.equal(GAME_DATA.areaRuntime.view.defaultCharacterScale, 1.265);
  assert(Object.isFrozen(GAME_DATA.appearance.actorView));
});

test("the arithmetic the literals sat in is unchanged", () => {
  assert.equal(OLD.huntArrivalShare * 7.3, 7.3 / 2);
  assert.equal(OLD.leanGain * 0.7, 0.7 * 0.3);
  assert.equal(OLD.reloadClipSeconds * (1 - 0.35), 2 * (1 - 0.35));
  assert.equal(new Set(OLD.roachBiteScales).has(3) && new Set(OLD.roachBiteScales).has(4), true);
  assert(![3, 4].includes(2) && !OLD.roachBiteScales.includes(2));
});

test("the loader rejects broken blocks", () => {
  const broken = (mutate) => () => {
    const d = rawAppearance();
    mutate(d.actorView);
    validateAppearance(d);
  };
  assert.throws(broken((a) => delete a.leanGain));
  assert.throws(broken((a) => (a.extra = 1)));
  assert.throws(broken((a) => (a.damageColor = "red")));
  assert.throws(broken((a) => (a.shadowBlob.outerRadius = 2)));
  assert.throws(broken((a) => (a.markedTint = [1, 0.5])));
  assert.throws(broken((a) => (a.calfBand = [0.6, 0.5])));
  assert.throws(broken((a) => (a.rocketAimTargets = 3.5)));
  assert.throws(broken((a) => (a.hitStepMax = 0)));
  assert.throws(broken((a) => (a.roachBiteScales = [])));
  assert.doesNotThrow(broken(() => {}));
});

test("actors.js keeps no tuning number and the baseline no longer lists it", () => {
  const text = fs.readFileSync(new URL("../src/actors.js", import.meta.url), "utf8");
  assert.equal(countNumberLiterals(text).count, 0);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url)));
  assert.equal(baseline.numberLiterals["actors.js"], undefined);
});
