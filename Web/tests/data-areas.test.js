import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { areaDefinitions, areaAssets } from "../src/area-definitions.js";
import { createAreaRegistry } from "../src/area-registry.js";
import { GAME_DATA, validateAreas } from "../src/engine/game-data.js";

// Data batch 6: areaDefinitions and areaAssets moved from area-definitions.js into Web/src/data/areas.json.
// tests/fixtures/areas-pre-data.json is the old in-code export, written from origin/main before the move.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/areas-pre-data.json", import.meta.url)));
const rawText = fs.readFileSync(new URL("../src/data/areas.json", import.meta.url), "utf8");
const raw = () => structuredClone(JSON.parse(rawText));
const manifest = JSON.parse(fs.readFileSync(new URL("../public/world/manifest.json", import.meta.url)));

test("the data file is pinned", () => {
  assert.equal(crypto.createHash("sha256").update(rawText).digest("hex"), "1aef2b46ca632bf40749ec2943b9f8953fa145c3fde43288221fb6c15c298cbc");
});

test("areaDefinitions and areaAssets equal the old in-code export (values and key order) except the one stale identity row, and are frozen", () => {
  // The old table still carried layout.east's identity from before the East exit work (#133 changed the file): 11117 bytes, sha 7f8b408e.
  // Nothing at runtime reads sha256/bytes (world.js uses only the path); tools/validate-area-registry.mjs does, and failed on main.
  // This is the only deliberate difference; the row now matches public/world/east/layout.json and manifest.json.
  const stale = old.assets["layout.east"];
  assert.deepEqual({ bytes: stale.bytes, sha256: stale.sha256.slice(0, 8) }, { bytes: 11117, sha256: "7f8b408e" });
  assert.deepEqual(areaDefinitions, old.areas);
  assert.deepEqual(areaAssets, { ...old.assets, "layout.east": { ...stale, bytes: 11463, sha256: areaAssets["layout.east"].sha256 } });
  assert(areaAssets["layout.east"].sha256.startsWith("db1e8b46"));
  assert.deepEqual(areaDefinitions.map((a) => a.id), old.areas.map((a) => a.id));
  assert.deepEqual(Object.keys(areaAssets), Object.keys(old.assets));
  assert.equal(areaDefinitions, GAME_DATA.areas.areas);
  assert(Object.isFrozen(areaDefinitions) && Object.isFrozen(areaDefinitions[0].exits[0]) && Object.isFrozen(areaAssets));
});

test("the default registry still builds from the data and the manifest agrees with every world asset row", () => {
  const registry = createAreaRegistry({ manifest });
  assert.deepEqual([...registry.ids], areaDefinitions.map((a) => a.id));
  const files = new Map(manifest.files.map((f) => [f.path, f]));
  let checked = 0;
  for (const [ref, asset] of Object.entries(areaAssets)) {
    if (!asset.path.startsWith("world/")) continue;
    const file = files.get(asset.path.slice("world/".length));
    assert(file, `${ref}: ${asset.path} is in manifest.json`);
    assert.equal(file.sha256, asset.sha256, `${ref} sha256`);
    assert.equal(file.bytes, asset.bytes, `${ref} bytes`);
    checked++;
  }
  assert(checked >= 12);
});

test("every asset row names the bytes that are on disk (what tools/validate-area-registry.mjs checks, which nothing ran in CI)", () => {
  for (const [ref, asset] of Object.entries(areaAssets)) {
    const bytes = fs.readFileSync(new URL(`../public/${asset.path}`, import.meta.url));
    assert.equal(bytes.length, asset.bytes, `${ref} bytes`);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), asset.sha256, `${ref} sha256`);
  }
});

test("the loader rejects a broken areas file", () => {
  const broken = (mutate) => () => {
    const d = raw();
    mutate(d);
    validateAreas(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { d.extra = 1; }));
  assert.throws(broken((d) => { d.areas = []; }));
  assert.throws(broken((d) => { d.areas[0].surprise = 1; }));
  assert.throws(broken((d) => { delete d.areas[0].entry; }));
  assert.throws(broken((d) => { d.areas[0].exits[0].extra = 1; }));
  assert.throws(broken((d) => { delete d.assets["layout.east"].sha256; }));
  assert.throws(broken((d) => { d.assets["layout.east"].sha256 = "xyz"; }));
  assert.throws(broken((d) => { d.assets["layout.east"].bytes = 0; }));
  assert.throws(broken((d) => { d.assets = []; }));
});
