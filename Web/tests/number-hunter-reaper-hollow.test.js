import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateCreatures, validateMarkedHunterSpawn, validateReaperMotion } from "../src/engine/game-data.js";
import { MAX_MONEY_CEILING } from "../src/engine/marked.js";
import { createHollowEncounter } from "../src/hollow-encounter.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// engine/marked-hunters.js 12 to 0, engine/marked.js 1 to 0 (marked), engine/reaper.js 3 to 0, hollow-encounter.js 11 to 0 (value-identical).
// Old values pinned from origin/main (6ce7e2b6): spawn clearances 0.4 / 0.43 / 2 / 0.65 and the 0.5 gate default and 4 s message in
// data/markedHunterSpawn.json; the Reaper's 1/30 step bound and 0.65 orbit rate in data/reaperMotion.json; the Hollow bounds in
// creatures.json hollowBounds. The gate midpoints and the money ceiling are marked tuning-ok.
const text = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const raw = (p) => structuredClone(JSON.parse(text(p)));

test("the data holds exactly the numbers the files used to hold in code", () => {
  assert.deepEqual(GAME_DATA.markedHunterSpawn, {
    schema_version: 1, bodyRadius: 0.4, safehouseRadius: 0.43, gateGap: 2, enemyGap: 0.65, gateDefaultCoordinate: 0.5, messageSeconds: 4,
  });
  assert.deepEqual(GAME_DATA.reaperMotion, { schema_version: 1, maxStepSeconds: 1 / 30, orbitRate: 0.65 });
  assert.deepEqual(GAME_DATA.creatures.hollowBounds, {
    bodyScaleMax: 3, count: [3, 5],
    ranges: { health: [1, 120], moveSpeed: [0.1, 6], regen: [0.1, 2], aggression: [0.1, 5], recovery: [0, 5] },
  });
  assert.equal(MAX_MONEY_CEILING, 1e9);
});

test("createHollowEncounter enforces the same limits as the old literals, edge by edge", () => {
  const hollow = { rig: "hollow-scavenger", weapon: "knife", contactRig: "hero", bodyScale: 1 };
  const make = (tuning, character = hollow) => () => createHollowEncounter(character, tuning);
  assert.doesNotThrow(make({}));
  assert.doesNotThrow(make({}, { ...hollow, bodyScale: 3 }));
  assert.throws(make({}, { ...hollow, bodyScale: 3.01 }));
  assert.throws(make({}, { ...hollow, bodyScale: 0 }));
  for (const [key, ok, bad] of [
    ["count", [3, 5], [2, 6]], ["health", [1, 120], [0.9, 120.1]], ["moveSpeed", [0.1, 6], [0.09, 6.1]],
    ["regen", [0.1, 2], [0.09, 2.1]], ["aggression", [0.1, 5], [0.09, 5.1]], ["recovery", [0, 5], [-0.1, 5.1]],
  ]) {
    for (const v of ok) assert.doesNotThrow(make({ [key]: v }), `${key}=${v}`);
    for (const v of bad) assert.throws(make({ [key]: v }), `${key}=${v}`);
  }
});

test("the sources read the data rows", () => {
  const hunters = text("../src/engine/marked-hunters.js"), reaper = text("../src/engine/reaper.js");
  for (const use of [
    "geometry.clear(p, SPAWN.bodyRadius)", "safehouseTouches(g, p, SPAWN.safehouseRadius)", "gap(p, q) < SPAWN.gateGap",
    "(e.radius ?? SPAWN.bodyRadius) + SPAWN.enemyGap", "bodyLineClear(geometry, p, target, SPAWN.bodyRadius)",
    "g.time + SPAWN.messageSeconds", "SPAWN.gateDefaultCoordinate",
  ])
    assert(hunters.includes(use), use);
  for (const use of ["dt > MOTION.maxStepSeconds", "g.time * MOTION.orbitRate"]) assert(reaper.includes(use), use);
});

test("the loaders refuse missing, extra and out-of-range numbers", () => {
  const spawn = (mutate) => () => { const d = raw("../src/data/markedHunterSpawn.json"); mutate(d); validateMarkedHunterSpawn(d); };
  assert.doesNotThrow(spawn(() => {}));
  assert.throws(spawn((d) => { delete d.gateGap; }));
  assert.throws(spawn((d) => { d.extra = 1; }));
  assert.throws(spawn((d) => { d.bodyRadius = 0; }));
  assert.throws(spawn((d) => { d.gateDefaultCoordinate = 1.5; }));
  const motion = (mutate) => () => { const d = raw("../src/data/reaperMotion.json"); mutate(d); validateReaperMotion(d); };
  assert.doesNotThrow(motion(() => {}));
  assert.throws(motion((d) => { d.maxStepSeconds = 0; }));
  assert.throws(motion((d) => { d.maxStepSeconds = 2; }));
  assert.throws(motion((d) => { delete d.orbitRate; }));
  const creatures = (mutate) => () => { const d = raw("../src/data/creatures.json"); mutate(d); validateCreatures(d); };
  assert.doesNotThrow(creatures(() => {}));
  assert.throws(creatures((d) => { delete d.hollowBounds; }));
  assert.throws(creatures((d) => { d.hollowBounds.extra = 1; }));
  assert.throws(creatures((d) => { d.hollowBounds.count = [5, 3]; }));
  assert.throws(creatures((d) => { d.hollowBounds.ranges.health = [1]; }));
  assert.throws(creatures((d) => { d.hollowTuning.health = 121; }));
});

test("the gate counts 0 in the four files and the baseline entries are gone", () => {
  const baseline = JSON.parse(text("../../scripts/as-data-baseline.json"));
  for (const file of ["engine/marked-hunters.js", "engine/marked.js", "engine/reaper.js", "hollow-encounter.js"]) {
    assert.equal(countNumberLiterals(text(`../src/${file}`)).count, 0, file);
    assert(!(file in baseline.numberLiterals), file);
  }
});
