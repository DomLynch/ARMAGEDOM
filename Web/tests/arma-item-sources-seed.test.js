// The database's arma_item_sources (where a save record keeps each always-drop weapon, and the loot item that is its receipt) must be what the game's own
// data says. Drift guard like the loot/payout/weapon seeds: when a weapon moves, this fails until a seed migration is generated
// (node server/data/generate-item-sources-seed.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { seedItemSources, seedLootRows } from "../../server/data/world-rows.js";
import { weaponLootSources } from "../../server/data/loot-sources.js";
import { worldSpawnRows } from "../src/engine/world-events.js";
import { createAreaRegistry } from "../src/area-registry.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";

const migrations = new URL("../../supabase/migrations/", import.meta.url);
const read = (path) => JSON.parse(fs.readFileSync(new URL("../public/" + path, import.meta.url), "utf8"));
const content = validateAreaMetadata(read("world/area-content.json"), createAreaRegistry({ manifest: read("world/manifest.json") }));

function migratedSources() {
  const rows = new Map();
  for (const file of fs.readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    const block = /insert into public\.arma_item_sources[^;]*;/.exec(fs.readFileSync(new URL(file, migrations), "utf8"))?.[0];
    if (block) for (const [, path, item] of block.matchAll(/\('([A-Za-z.]+)',\s*'([a-z0-9._:-]+)'\)/g)) rows.set(path, item);
  }
  return rows;
}

test("the seeded item sources equal the game's weapon sources, path for path", () => {
  const expected = seedItemSources(weaponLootSources(content));
  const seeded = migratedSources();
  assert.deepEqual([...seeded.keys()].sort(), expected.map(([path]) => path).sort());
  for (const [path, item] of expected) assert.equal(seeded.get(path), item, `${path}: generate the next seed migration`);
});

test("the record paths are the layers the save record really has, and each item is also a loot drop (a receipt can exist)", () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/navigation203-source202-v18.json", import.meta.url), "utf8"));
  for (const [path] of seedItemSources(weaponLootSources(content))) assert.equal(path.split(".").reduce((o, k) => o?.[k], fixture)?.status, "owned", `${path} is a layer of the v18 record`);
  const spawns = [...worldSpawnRows(content, "A"), ...worldSpawnRows(content, "B")];
  const dropped = new Set(seedLootRows(spawns, weaponLootSources(content)).map((row) => row[2]));
  assert.deepEqual([...dropped].sort(), seedItemSources(weaponLootSources(content)).map(([, item]) => item).sort());
});

test("seedItemSources refuses a gap or a duplicate", () => {
  assert.throws(() => seedItemSources([{ path: "a b", itemId: "x-v1" }]), /bad record path/);
  assert.throws(() => seedItemSources([{ path: "rifle", itemId: "Bad Item" }]), /bad item/);
  assert.throws(() => seedItemSources([{ path: "rifle", itemId: "x-v1" }, { path: "rifle", itemId: "y-v1" }]), /duplicate/);
  assert.throws(() => seedItemSources([{ path: "rifle", itemId: "x-v1" }, { path: "uniqueReward", itemId: "x-v1" }]), /duplicate/);
});
