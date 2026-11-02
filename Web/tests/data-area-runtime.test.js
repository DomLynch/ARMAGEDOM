import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { DEFAULT_LIGHTING, validateAreaLighting } from "../src/engine/area-lighting.js";
import { PREFETCH_LIMITS } from "../src/engine/area-prefetch.js";
import { PARKED_AREA_LIMIT } from "../src/engine/areas.js";
import { createAreaRegistry } from "../src/area-registry.js";
import { GAME_DATA, validateAreaRuntime } from "../src/engine/game-data.js";
import { countConstantTables } from "../../scripts/as-data-gate.mjs";

// Data batch 7: DEFAULT_LIGHTING, PREFETCH_LIMITS and PARKED_AREA_LIMIT moved into Web/src/data/areaRuntime.json.
// tests/fixtures/area-limits-pre-data.json is what the old modules exported on origin/main (a901050), dumped by importing them.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/area-limits-pre-data.json", import.meta.url)));
const rawText = fs.readFileSync(new URL("../src/data/areaRuntime.json", import.meta.url), "utf8");
const raw = () => structuredClone(JSON.parse(rawText));

test("the data file's original sections are pinned", () => {
  // Later batches add sections to this file (travel timings, texture budget): this pin covers the three batch 7 sections only.
  const { defaultLighting, prefetch, parkedAreas } = JSON.parse(rawText);
  const section = JSON.stringify({ defaultLighting, prefetch, parkedAreas });
  assert.equal(crypto.createHash("sha256").update(section).digest("hex"), "a4797e6d6a48cb3ef2af82bea202c99657e31a32f3ce41ef0e2cc8cca1ad0029");
});

test("the three exports equal the old modules' values exactly (key order too) and are frozen data rows", () => {
  assert.deepEqual(DEFAULT_LIGHTING, old.DEFAULT_LIGHTING);
  assert.deepEqual(PREFETCH_LIMITS, old.PREFETCH_LIMITS);
  assert.deepEqual(PARKED_AREA_LIMIT, old.PARKED_AREA_LIMIT);
  assert.deepEqual(Object.keys(PREFETCH_LIMITS), Object.keys(old.PREFETCH_LIMITS));
  assert.equal(PARKED_AREA_LIMIT.maxBytes, 30 * 1024 * 1024);
  assert.equal(DEFAULT_LIGHTING, GAME_DATA.areaRuntime.defaultLighting);
  assert.equal(PREFETCH_LIMITS, GAME_DATA.areaRuntime.prefetch);
  assert.equal(PARKED_AREA_LIMIT, GAME_DATA.areaRuntime.parkedAreas);
  for (const row of [DEFAULT_LIGHTING, PREFETCH_LIMITS, PARKED_AREA_LIMIT]) assert(Object.isFrozen(row));
});

test("an area without a lighting preset still resolves to the old default intensities", () => {
  const registry = createAreaRegistry();
  const resolved = validateAreaLighting(undefined, registry);
  for (const id of registry.ids) assert.deepEqual(resolved[id], old.DEFAULT_LIGHTING);
});

test("the loader rejects a broken area runtime file", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateAreaRuntime(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { d.extra = 1; }));
  assert.throws(broken((d) => { d.defaultLighting.fillIntensity = 9; }));
  assert.throws(broken((d) => { d.defaultLighting.keyIntensity = -1; }));
  assert.throws(broken((d) => { delete d.defaultLighting.keyIntensity; }));
  assert.throws(broken((d) => { d.prefetch.bytesPerSecond = 0; }));
  assert.throws(broken((d) => { d.prefetch.maxNeighbours = 0; }));
  assert.throws(broken((d) => { d.prefetch.recheckMs = 1.5; }));
  assert.throws(broken((d) => { d.prefetch.surprise = 1; }));
  assert.throws(broken((d) => { d.parkedAreas.maxAreas = 0; }));
  assert.throws(broken((d) => { d.parkedAreas.maxBytes = "30MB"; }));
  assert.throws(broken((d) => { delete d.parkedAreas; }));
});

test("the three engine files hold no constant table; the baseline says so", () => {
  for (const file of ["area-lighting.js", "area-prefetch.js", "areas.js"])
    assert.equal(countConstantTables(fs.readFileSync(new URL(`../src/engine/${file}`, import.meta.url), "utf8")), 0, file);
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url), "utf8"));
  for (const file of ["engine/area-lighting.js", "engine/area-prefetch.js", "engine/areas.js"]) assert(!(file in baseline.constantTables));
});
