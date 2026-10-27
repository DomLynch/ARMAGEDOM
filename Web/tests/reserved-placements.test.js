import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAreaRegistry } from "../src/area-registry.js";
import { GAME_DATA } from "../src/engine/game-data.js";
import { createProgressionModel } from "../src/engine/progression-state.js";
import { progressionOptions } from "../src/engine/progression-runtime.js";

// The reader-first release registered these placement keys before they spawned (spawns.json reservedPlacements). This release
// spawns them, so the reserved block is gone and every key must now be a real row the save reader still knows.
const read = (path) => JSON.parse(readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8"));
const content = read("world/area-content.json"),
  registry = createAreaRegistry({ manifest: read("world/manifest.json") });
const range = (prefix, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
const former = {
  "east-bridge": range("east-bridge-resident-", 3, 9),
  "elephant-and-castle": range("elephant-and-castle-resident-", 3, 9),
  lambeth: range("lambeth-resident-", 3, 9),
  area7: range("area7-resident-", 1, 8),
  area8: range("area8-resident-", 5, 10),
  westminster: range("westminster-roamer-", 7, 8),
  east: range("east-roamer-", 10, 12),
  south: range("south-roamer-", 10, 12),
};

test("no reserved block remains and every formerly reserved key is a placed resident", () => {
  assert.equal(GAME_DATA.spawns.reservedPlacements, undefined);
  const placed = (area) => [...(content.residents[area] ?? []), ...(GAME_DATA.spawns.mob[area] ?? [])].map((row) => row.key);
  for (const [area, keys] of Object.entries(former)) for (const key of keys) assert.ok(placed(area).includes(key), key);
});

test("a save holding a kill award for a formerly reserved key reads valid", () => {
  const options = progressionOptions({
    world: { registry, progressionData: content.progression, residentPlacements: content.residents },
    player: { maxHP: 100, maxStamina: 100 },
  });
  const model = createProgressionModel(options);
  for (const [area, keys] of Object.entries(former)) {
    const { state } = model.award(model.freshState(), [{ placementKey: keys[0], areaId: area, weaponId: "knife" }]);
    assert.equal(model.valid(state), true, keys[0]);
  }
});
