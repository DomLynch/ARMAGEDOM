import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
  assert.equal(crypto.createHash("sha256").update(rawText).digest("hex"), "0855856a7ee0705fcf36dc78e80995c24ea856289d8e0e5928eb239c11a5af94"); // re-pinned: area8, elephant-and-castle and east-bridge layouts changed (alpha blockers), after Westminster south exit zone yMin 0.96
});

test("areaDefinitions and areaAssets equal the old in-code export (values and key order) except the one stale identity row, and are frozen", () => {
  // The old table still carried layout.east's identity from before the East exit work (#133 changed the file): 11117 bytes, sha 7f8b408e.
  // Nothing at runtime reads sha256/bytes (world.js uses only the path); tools/validate-area-registry.mjs does, and failed on main.
  // This is the only deliberate difference; the row now matches public/world/east/layout.json and manifest.json.
  const stale = old.assets["layout.east"];
  assert.deepEqual({ bytes: stale.bytes, sha256: stale.sha256.slice(0, 8) }, { bytes: 11117, sha256: "7f8b408e" });
  // Exit triggers: the pre-move table, minus the `condition` boxes that were deliberately widened and the one arrival that moved
  // with them (both checked in the next test), is unchanged.
  const withoutConditions = (areas) => areas.map((a) => ({ ...a, exits: a.exits.map(({ condition, entry, ...rest }) => rest) }));
  assert.deepEqual(withoutConditions(areaDefinitions), withoutConditions(old.areas));
  // The alpha-blocker layouts (area8, elephant-and-castle, east-bridge) also changed identity; their rows are checked against the files on disk below.
  const moved = ["layout.area8", "layout.elephant-and-castle", "layout.east-bridge"];
  assert.deepEqual(areaAssets, {
    ...old.assets,
    "layout.east": { ...stale, bytes: 11463, sha256: areaAssets["layout.east"].sha256 },
    ...Object.fromEntries(moved.map((ref) => [ref, { ...old.assets[ref], bytes: areaAssets[ref].bytes, sha256: areaAssets[ref].sha256 }])),
  });
  assert(areaAssets["layout.east"].sha256.startsWith("db1e8b46"));
  assert.deepEqual(areaDefinitions.map((a) => a.id), old.areas.map((a) => a.id));
  assert.deepEqual(Object.keys(areaAssets), Object.keys(old.assets));
  assert.equal(areaDefinitions, GAME_DATA.areas.areas);
  assert(Object.isFrozen(areaDefinitions) && Object.isFrozen(areaDefinitions[0].exits[0]) && Object.isFrozen(areaAssets));
});

test("exit triggers: every closed box is at least 0.04 each way, only ever grew around its old centre, and no two zones in an area overlap", () => {
  const MIN = 0.04 - 1e-9;
  const widened = [];
  for (const [i, area] of areaDefinitions.entries())
    for (const [j, exit] of area.exits.entries()) {
      const was = old.areas[i].exits[j].condition,
        now = exit.condition;
      assert.deepEqual(Object.keys(now), Object.keys(was), `${exit.id} keeps the same condition keys`);
      for (const [lo, hi] of [["xMin", "xMax"], ["yMin", "yMax"]]) {
        if (was[lo] === undefined || was[hi] === undefined) continue;
        // East to South cannot reach 0.04 high: the East gate rule (east-south-shortcut.test.js) wants every sampled gate point fully
        // clear at player radius, and the plaza edge there is a 0.031-high band at most for a box that still contains the old strip (searched on the real collision).
        // It was 0.013 high and 0.05 wide; it is now 0.031 high and 0.06 wide.
        const floor = exit.id === "exit.east.south" && lo === "yMin" ? 0.031 - 1e-9 : MIN;
        assert(now[hi] - now[lo] >= floor, `${exit.id} ${lo}/${hi} is wide enough`);
        assert(now[lo] <= was[lo] + 1e-9 && now[hi] >= was[hi] - 1e-9, `${exit.id} ${lo}/${hi} contains the old box`);
        if (now[lo] !== was[lo] || now[hi] !== was[hi]) widened.push(`${exit.id} ${lo}`);
      }
      for (const key of Object.keys(was)) if (!/^[xy]M(in|ax)$/.test(key)) assert.equal(now[key], was[key]);
      for (const key of ["xMin", "yMin"]) if (was[key] !== undefined && was[key] === 0) assert.equal(now[key], 0);
    }
  assert(widened.length >= 15, `the thin exits were widened (${widened.length} edges)`);
  const box = (c) => ({ x0: c.xMin ?? -1, x1: c.xMax ?? 2, y0: c.yMin ?? -1, y1: c.yMax ?? 2 });
  for (const area of areaDefinitions)
    for (let i = 0; i < area.exits.length; i++)
      for (let j = i + 1; j < area.exits.length; j++) {
        const p = box(area.exits[i].condition), q = box(area.exits[j].condition);
        assert(!(p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1), `${area.exits[i].id} overlaps ${area.exits[j].id}`);
      }
  // The arrival points did not move, except one: the widened East to South box now reaches the old Central Hub to East arrival
  // (0.785, 0.365), which would have bounced a player straight back to South; it moved to the nearest clear point 0.042 away.
  const moved = [];
  areaDefinitions.forEach((a, i) => a.exits.forEach((e, j) => { if (JSON.stringify(e.entry) !== JSON.stringify(old.areas[i].exits[j].entry)) moved.push(e.id); }));
  assert.deepEqual(moved, ["exit.central-hub.east"]);
  assert.deepEqual(areaDefinitions.at(-1).exits[1].entry, { x: 0.815, y: 0.335 });
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

test("tools/validate-area-registry.mjs passes, so drift between the registry, the assets and the manifest fails the build", () => {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL("../tools/validate-area-registry.mjs", import.meta.url))], {
    encoding: "utf8",
    env: { ...process.env, NODE_TEST_CONTEXT: undefined },
  });
  assert.equal(run.status, 0, `${run.stderr}`.slice(0, 600));
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
