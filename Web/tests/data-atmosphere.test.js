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
const rawText = fs.readFileSync(new URL("../src/data/atmosphere.json", import.meta.url), "utf8");
const raw = () => structuredClone(JSON.parse(rawText));

test("the data file's original sections are pinned", () => {
  // The `variation` section was added later (tests/data-atmosphere-variation.test.js pins it): this pin covers the batch 3.2 sections.
  const { presets, areas, budgets, bends } = JSON.parse(rawText);
  const section = JSON.stringify({ presets, areas, budgets, bends });
  assert.equal(crypto.createHash("sha256").update(section).digest("hex"), "ef5913c157fb02f37783ee633e3364cf9174188c9a88f02077603f74c906d08d");
});

test("presets, anchors, budgets and bends equal the old in-code tables exactly (values and key order)", () => {
  assert.deepEqual(ATMOSPHERE_PRESETS, old.presets);
  assert.deepEqual(AREA_ATMOSPHERE, old.areas);
  assert.deepEqual(GAME_DATA.atmosphere.bends, old.bends);
  for (const area of Object.keys(old.areas)) {
    assert.deepEqual(atmosphereBudget(area), old.budgets[area]);
    assert.deepEqual(Object.keys(AREA_ATMOSPHERE[area].map((a) => a.id)), Object.keys(old.areas[area].map((a) => a.id)));
  }
  assert(Object.isFrozen(AREA_ATMOSPHERE.westminster) && Object.isFrozen(AREA_ATMOSPHERE.westminster[0]));
});

test("atmosphereForArea resolves every area exactly as before, and an unknown area to nothing", () => {
  for (const area of ["westminster", "east", "south", "area7"]) assert.deepEqual(atmosphereForArea(area), old.resolved[area]);
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
