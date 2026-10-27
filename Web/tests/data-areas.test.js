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
  assert.equal(crypto.createHash("sha256").update(rawText).digest("hex"), "1239dd02f18e149902c1c92f4a6415c20ae704fa12d89a94221c60dde3b225a4"); // re-pinned 27 Oct: layout.westminster identity (set-piece slot); earlier:area8: a red-and-white concrete barrier painted across the up-left lane with a matching blocker, the dead-end lane beyond it cut from the road and its one resident moved (world/area8-barrier); east-bridge: the road opens south through the cleared supply barricade (blocker and depth mask removed, barricade, crates and barrier painted out), the East exit moved to the bottom of that road and the East arrival sits inside it (world/east-bridge-south-exit);exits follow the 3x3 map grid (24 links, grid-links.test.js); Westminster exits all need the Matron down; the area8, elephant-and-castle and east-bridge layouts lost their painted-out depth masks and their phone backdrops were painted; six phone backdrops colour-graded to the Westminster/East/South look (art/backdrop-grade); south: the road opens north through the barrel/wreck gap and past the statue plinth, the bus footprint is shorter at its right end, and the sandbag pile, crate and barrel beside the plinth are painted out (art/backdrop-paint-out, world/south-clears); lambeth: layout zoom lowered 20% and portraitScale 0.8, lamp-post pocket made walkable, backdrop sharpened and the lamp painted out
});

test("areaDefinitions and areaAssets equal the old in-code export (values and key order) except the one stale identity row, and are frozen", () => {
  // The old table still carried layout.east's identity from before the East exit work (#133 changed the file): 11117 bytes, sha 7f8b408e.
  // Nothing at runtime reads sha256/bytes (world.js uses only the path); tools/validate-area-registry.mjs does, and failed on main.
  // This is the only deliberate difference; the row now matches public/world/east/layout.json and manifest.json.
  const stale = old.assets["layout.east"];
  assert.deepEqual({ bytes: stale.bytes, sha256: stale.sha256.slice(0, 8) }, { bytes: 11117, sha256: "7f8b408e" });
  // The exits are no longer the pre-move table: they follow the map grid (grid-links.test.js). Everything else about each area is unchanged.
  const withoutExits = (areas) => areas.map(({ exits, ...rest }) => rest);
  assert.deepEqual(withoutExits(areaDefinitions), withoutExits(old.areas));
  // The layout files whose guidance rows went with the retired exits have new bytes and hashes; the next two tests check them on disk.
  // The phone backdrops of area8, elephant-and-castle and east-bridge were painted over (the blocked objects are gone from the picture), so those three rows moved too.
  const painted = ["backdrop.area8", "backdrop.elephant-and-castle", "backdrop.east-bridge"];
  const withoutLayoutIdentity = (assets) =>
    Object.fromEntries(
      Object.entries(assets).map(([ref, row]) => [ref, ref.startsWith("layout.") || painted.includes(ref) ? { ...row, bytes: 0, sha256: "" } : row]),
    );
  assert.deepEqual(withoutLayoutIdentity(areaAssets), withoutLayoutIdentity(old.assets));
  assert.deepEqual(areaDefinitions.map((a) => a.id), old.areas.map((a) => a.id));
  assert.deepEqual(Object.keys(areaAssets), Object.keys(old.assets));
  assert.equal(areaDefinitions, GAME_DATA.areas.areas);
  assert(Object.isFrozen(areaDefinitions) && Object.isFrozen(areaDefinitions[0].exits[0]) && Object.isFrozen(areaAssets));
});

test("exit triggers: every closed box is at least 0.04 each way, and no two zones in an area overlap", () => {
  const MIN = 0.04 - 1e-9;
  for (const area of areaDefinitions)
    for (const exit of area.exits)
      for (const [lo, hi] of [["xMin", "xMax"], ["yMin", "yMax"]])
        if (exit.condition[lo] !== undefined && exit.condition[hi] !== undefined)
          assert(exit.condition[hi] - exit.condition[lo] >= MIN, `${exit.id} ${lo}/${hi} is wide enough`);
  const box = (c) => ({ x0: c.xMin ?? -1, x1: c.xMax ?? 2, y0: c.yMin ?? -1, y1: c.yMax ?? 2 });
  for (const area of areaDefinitions)
    for (let i = 0; i < area.exits.length; i++)
      for (let j = i + 1; j < area.exits.length; j++) {
        const p = box(area.exits[i].condition), q = box(area.exits[j].condition);
        assert(!(p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1), `${area.exits[i].id} overlaps ${area.exits[j].id}`);
      }
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
