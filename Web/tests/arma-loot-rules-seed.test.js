// The database's seeded always-drop weapons (arma_loot_rules, keyed by spawn instance) must be what the game's own data says: the boss equipment, the rifle
// and the unique reward, each on the spawn row of its source placement. Drift guard like the weapon and payout seeds: when the game moves a drop or adds
// one, this fails until a seed migration is generated (node server/data/generate-loot-seed.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { seedLootRows } from "../../server/data/world-rows.js";
import { weaponLootSources } from "../../server/data/loot-sources.js";
import { worldSpawnRows } from "../src/engine/world-events.js";
import { createAreaRegistry } from "../src/area-registry.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";

const migrations = new URL("../../supabase/migrations/", import.meta.url);
const read = (path) => JSON.parse(fs.readFileSync(new URL("../public/" + path, import.meta.url), "utf8"));
const content = validateAreaMetadata(read("world/area-content.json"), createAreaRegistry({ manifest: read("world/manifest.json") }));
const spawns = [...worldSpawnRows(content, "A"), ...worldSpawnRows(content, "B")];

/** The rows the migrations leave in arma_loot_rules from generated seeds, in file order (a later one overrides an earlier one). */
function migratedLoot() {
  const rules = new Map();
  for (const file of fs.readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    const block = /insert into public\.arma_loot_rules[^;]*;/.exec(fs.readFileSync(new URL(file, migrations), "utf8"))?.[0];
    if (block) for (const [, kind, slot, item, chance] of block.matchAll(/\('([a-z0-9._:-]+)',\s*(\d+),\s*'([a-z0-9._:-]+)',\s*([0-9.]+)\)/g)) rules.set(`${kind}#${slot}`, [item, Number(chance)]);
  }
  return rules;
}

test("the seeded loot rules equal the game's always-drop weapons, each on its source placement's spawn row", () => {
  const expected = seedLootRows(spawns, weaponLootSources(content));
  const seeded = migratedLoot();
  assert.deepEqual([...seeded.keys()].sort(), expected.map(([key, slot]) => `${key}#${slot}`).sort(), "a moved or new drop needs a seed migration");
  for (const [key, slot, item, chance] of expected) assert.deepEqual(seeded.get(`${key}#${slot}`), [item, chance], `${key}: generate the next seed migration`);
});

test("pinned example: Hale's cleaver drops from east:east-roamer-2, the rifle from the bridge warden", () => {
  const seeded = migratedLoot();
  assert.deepEqual(seeded.get("east:east-roamer-2#0"), ["hale-pitborn-cleaver-v1", 1]);
  assert.deepEqual(seeded.get("east-bridge:boss-warden-v1#0"), ["bridge-warden-rifle-v1", 1]);
});

test("every game weapon source is found (none silently skipped), and seedLootRows refuses a source that is not a spawn row", () => {
  assert.equal(weaponLootSources(content).length, 8, "seven boss equipment/rifle sources and the unique reward");
  assert.throws(() => seedLootRows([{ instance: "a:b" }], [{ areaId: "a", placementKey: "gone", itemId: "x-v1" }]), /not a spawn row/);
  assert.throws(() => seedLootRows([{ instance: "a:b" }], [{ areaId: "a", placementKey: "b", itemId: "Bad Item" }]), /bad item/);
  assert.deepEqual(seedLootRows([{ instance: "a:b" }], [{ areaId: "a", placementKey: "b", itemId: "x-v1" }, { areaId: "a", placementKey: "b", itemId: "y-v1" }]), [["a:b", 0, "x-v1", 1], ["a:b", 1, "y-v1", 1]]);
});
