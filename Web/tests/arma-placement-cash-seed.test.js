// The database's seeded award payouts (arma_placement_cash, migration 20261105000030) must be what the game pays a kill: one row per placement, the
// union of both animal cycles, a boss placement at marked.bossCash and every other at marked.cashPerKill (the rule in engine/marked-core.js). Drift
// guard like arma-payout-rules-seed.test.js: when a placement, a boss or a rate changes this fails until the seed is regenerated
// (node server/data/generate-payout-seed.mjs --placements).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { seedPlacementRows } from "../../server/data/world-rows.js";
import { worldSpawnRows } from "../src/engine/world-events.js";
import { createAreaRegistry } from "../src/area-registry.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";

const migrations = new URL("../../supabase/migrations/", import.meta.url);
const read = (path) => JSON.parse(fs.readFileSync(new URL("../public/" + path, import.meta.url), "utf8"));
const content = validateAreaMetadata(read("world/area-content.json"), createAreaRegistry({ manifest: read("world/manifest.json") }));
const cycles = () => [worldSpawnRows(content, "A"), worldSpawnRows(content, "B")];
const bossKinds = () => new Set(Object.values(content.bossData.profiles).map((profile) => profile.modelRef));

/** The rows the migrations leave in arma_placement_cash: every migration that inserts them, in file order, a later one overriding an earlier. */
function migratedPlacements() {
  const rows = new Map();
  for (const file of fs.readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    const block = /insert into public\.arma_placement_cash[^;]*;/.exec(fs.readFileSync(new URL(file, migrations), "utf8"))?.[0];
    if (block) for (const [, instance, cash] of block.matchAll(/\('([a-z0-9._:-]+)',\s*(\d+)\)/g)) rows.set(instance, Number(cash));
  }
  return rows;
}

test("the seeded placements equal the game's: both cycles, bosses at bossCash, the rest at cashPerKill", () => {
  const expected = seedPlacementRows(cycles(), bossKinds(), content.markedData);
  const seeded = migratedPlacements();
  assert.deepEqual([...seeded.keys()].sort(), expected.map(([instance]) => instance).sort(), "a new or moved placement needs a seed migration");
  for (const [instance, cash] of expected) assert.equal(seeded.get(instance), cash, `${instance}: generate the next seed migration`);
});

test("cycle B names the same placements as cycle A, and a creature kind that changes between them never changes the cash", () => {
  const [a, b] = cycles().map((rows) => new Map(rows.map((row) => [row.instance, row.kind])));
  assert.equal(a.size, 78);
  assert.deepEqual([...b.keys()].sort(), [...a.keys()].sort(), "the same 78 placements in both cycles");
  const changed = [...a.keys()].filter((instance) => a.get(instance) !== b.get(instance));
  assert.ok(changed.length > 0, "the cycles do differ in kind (a rat becomes a spider), so the same-cash check below is meaningful");
  for (const instance of changed) assert.ok(!bossKinds().has(a.get(instance)) && !bossKinds().has(b.get(instance)), `${instance}: a boss never changes kind`);
});

test("the cash of every placement is the rule the client pays by: its boss placements at bossCash, the others at cashPerKill", () => {
  const seeded = migratedPlacements();
  const bossInstances = new Set(content.bossData.placements.map((p) => `${p.areaId}:${p.key}`));
  assert.equal(bossInstances.size, 7);
  for (const instance of bossInstances) assert.ok(seeded.has(instance), `boss placement ${instance} has a row`);
  for (const [instance, cash] of seeded) assert.equal(cash, bossInstances.has(instance) ? content.markedData.bossCash : content.markedData.cashPerKill, instance);
  assert.deepEqual([seeded.size, [...seeded.values()].reduce((sum, cash) => sum + cash, 0)], [78, 71 * content.markedData.cashPerKill + 7 * content.markedData.bossCash]);
});

test("seedPlacementRows refuses a placement that pays differently in two cycles, a bad name and a gap", () => {
  const marked = { cashPerKill: 1, bossCash: 2 };
  assert.throws(() => seedPlacementRows([[{ instance: "a:x", kind: "rat" }], [{ instance: "a:x", kind: "boss-b" }]], new Set(["boss-b"]), marked), /pays 1 in one cycle and 2/);
  assert.throws(() => seedPlacementRows([[{ instance: "Bad Name", kind: "rat" }]], new Set(), marked), /bad instance/);
  assert.throws(() => seedPlacementRows([[{ instance: "a:x", kind: "rat" }]], new Set(), { cashPerKill: 1 }), /bossCash/);
  assert.deepEqual(seedPlacementRows([[{ instance: "b:y", kind: "rat" }, { instance: "a:x", kind: "boss-b" }], [{ instance: "a:x", kind: "boss-b" }]], new Set(["boss-b"]), marked), [["a:x", 2], ["b:y", 1]]);
});
