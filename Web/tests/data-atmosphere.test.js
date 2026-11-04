import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { ATMOSPHERE_PRESETS, AREA_ATMOSPHERE, atmosphereBudget, atmosphereForArea } from "../src/atmosphere-areas.js";
import { GAME_DATA, validateAtmosphere } from "../src/engine/game-data.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data move (batch 3.2): the atmosphere presets, anchors and budgets and the bridge BENDS moved from code into
// Web/src/data/atmosphere.json. tests/fixtures/atmosphere-pre-data.json is the old in-code output, generated from origin/main
// before the move (presets, area anchors, budgets, bends, and atmosphereForArea() for every area).
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/atmosphere-pre-data.json", import.meta.url)));
// Anchors removed on purpose since the move: south-near-drum, the fire of the barrel painted out of the South backdrop (28 Oct, art/south-clear-crates-hedgehog).
// The frozen fixture is left as recorded; the comparisons below drop these ids from it.
const REMOVED = ["south-near-drum"];
// Anchors added since (more smoke and fire on visibly burnt places, within the 28-quad budget); the frozen fixture predates them, so the live data drops them for the comparison.
const ADDED = ["west-left-rubble-fire", "west-far-bank-fire", "west-van-smoulder", "east-barge-smoulder", "east-shore-fire", "east-quay-fire", "south-bridge-ruin", "south-ruin-tower"];
const keep = (rows) => rows.filter((a) => !REMOVED.includes(a.id));
const keepLive = (rows) => rows.filter((a) => !ADDED.includes(a.id));
const keepAreas = (areas) => Object.fromEntries(Object.entries(areas).map(([k, rows]) => [k, keep(rows)]));
const liveAreas = () => Object.fromEntries(Object.entries(AREA_ATMOSPHERE).map(([k, rows]) => [k, keepLive(rows)]));
const rawText = fs.readFileSync(new URL("../src/data/atmosphere.json", import.meta.url), "utf8");
const raw = () => structuredClone(JSON.parse(rawText));

test("the data file's original sections are pinned", () => {
  // The `variation` section was added later (tests/data-atmosphere-variation.test.js pins it): this pin covers the batch 3.2 sections.
  const { presets, areas: liveRows, budgets, bends } = JSON.parse(rawText);
  const areas = Object.fromEntries(Object.entries(liveRows).map(([k, rows]) => [k, keepLive(rows)])); // the added anchors are pinned below
  const section = JSON.stringify({ presets, areas, budgets, bends });
  assert.equal(crypto.createHash("sha256").update(section).digest("hex"), "70fc50ec4026d8a3572a140985293460ca7698377cf64e899cc12273836d7083");
});

test("the added anchors are pinned (the quad budget is checked in atmosphere.test.js)", () => {
  const added = Object.values(AREA_ATMOSPHERE).flat().filter((a) => ADDED.includes(a.id));
  assert.equal(added.length, ADDED.length);
  assert.equal(crypto.createHash("sha256").update(JSON.stringify(added)).digest("hex"), "a149c4a072ffa25d22798ae7da9813c2b3936152e80bd2614037febb403d20d1");
});

test("presets, anchors, budgets and bends equal the old in-code tables exactly (values and key order)", () => {
  assert.deepEqual(ATMOSPHERE_PRESETS, old.presets);
  assert.deepEqual(liveAreas(), keepAreas(old.areas));
  assert.deepEqual(GAME_DATA.atmosphere.bends, old.bends);
  for (const area of Object.keys(old.areas)) {
    assert.deepEqual(atmosphereBudget(area), old.budgets[area]);
    assert.deepEqual(keepLive(AREA_ATMOSPHERE[area]).map((a) => a.id), keep(old.areas[area]).map((a) => a.id));
  }
  assert(Object.isFrozen(AREA_ATMOSPHERE.westminster) && Object.isFrozen(AREA_ATMOSPHERE.westminster[0]));
});

test("atmosphereForArea resolves every area exactly as before, and an unknown area to nothing", () => {
  for (const area of ["westminster", "east", "south", "area7"]) assert.deepEqual(keepLive(atmosphereForArea(area)), keep(old.resolved[area]));
  assert.deepEqual(atmosphereBudget("area7"), { quads: 0, drawCalls: 0, textureBytes: 0 });
  assert.deepEqual(atmosphereBudget("east", { quads: 1, drawCalls: 1, textureBytes: 0 }), { quads: 1, drawCalls: 1, textureBytes: 0 });
});

test("the loader rejects a broken atmosphere file", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateAtmosphere(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { d.extra = 1; }));
  assert.throws(broken((d) => { d.areas.east[0].preset = "no-such-preset"; }));
  assert.throws(broken((d) => { d.areas.east[1].id = d.areas.east[0].id; }));
  assert.throws(broken((d) => { d.areas.east[0].x = 1.5; }));
  assert.throws(broken((d) => { d.areas.east[0].seed = -1; }));
  assert.throws(broken((d) => { d.areas.east[0].surprise = 1; }));
  assert.throws(broken((d) => { d.budgets.east.textureBytes = 4; }));
  assert.throws(broken((d) => { delete d.budgets.south; }));
  assert.throws(broken((d) => { d.bends.east = [[0.1, 0.1]]; }));
  assert.throws(broken((d) => { d.bends.east[0] = [0.1, 2]; }));
  assert.throws(broken((d) => { delete d.bends; }));
});

test("the three code files no longer hold constant tables; the baseline says so", () => {
  for (const file of ["atmosphere-areas.js", "bridge-steering.js"])
    assert.equal(countConstantTables(fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")), 0);
  assert(!fs.existsSync(new URL("../src/atmosphere-westminster.js", import.meta.url)));
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  for (const file of ["atmosphere-areas.js", "atmosphere-westminster.js", "bridge-steering.js"]) assert(!(file in baseline.constantTables));
});
