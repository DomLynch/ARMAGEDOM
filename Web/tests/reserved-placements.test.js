import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAreaRegistry } from "../src/area-registry.js";
import { GAME_DATA, validateSpawns } from "../src/engine/game-data.js";
import { createProgressionModel } from "../src/engine/progression-state.js";
import { progressionOptions } from "../src/engine/progression-runtime.js";
import { AREA_MOB_SPAWNS } from "../src/area-mob-spawns.js";

// Reader-first release: the placements a later release will spawn are registered with the save reader now and spawn nothing,
// so a rollback to this release still reads a save that already holds a kill award for one of them.
const read = (path) => JSON.parse(readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8"));
const content = read("world/area-content.json"),
  registry = createAreaRegistry({ manifest: read("world/manifest.json") });
const reserved = GAME_DATA.spawns.reservedPlacements;
const options = () => progressionOptions({ world: { registry, progressionData: content.progression, residentPlacements: content.residents }, player: { maxHP: 100, maxStamina: 100 } });

test("reserved placements are registered but not placed", () => {
  const live = new Set([...Object.values(content.residents), ...Object.values(AREA_MOB_SPAWNS)].flat().map((row) => row.key));
  for (const [area, keys] of Object.entries(reserved)) {
    assert.ok(registry.ids.includes(area), area);
    for (const key of keys) assert.ok(!live.has(key), `${key} must not spawn yet`);
  }
});

test("a save holding a reserved kill award is valid, and an unregistered key is still refused", () => {
  const model = createProgressionModel(options());
  const [area, [key]] = Object.entries(reserved)[0];
  const { state } = model.award(model.freshState(), [{ placementKey: key, areaId: area, weaponId: "knife" }]);
  assert.equal(model.valid(state), true);
  assert.equal(model.valid(JSON.parse(JSON.stringify(state))), true);
  assert.throws(() => model.award(model.freshState(), [{ placementKey: "area7-resident-99", areaId: "area7", weaponId: "knife" }]), /Invalid award identity/);
});

test("the validator refuses a reserved key that is already a live row, a duplicate or a bad name", () => {
  const bad = (change) => {
    const copy = structuredClone(GAME_DATA.spawns);
    change(copy);
    assert.throws(() => validateSpawns(copy), /Invalid/);
  };
  assert.doesNotThrow(() => validateSpawns(structuredClone(GAME_DATA.spawns)));
  bad((d) => d.reservedPlacements.south.push(d.mob.south[0].key));
  bad((d) => d.reservedPlacements.south.push(d.reservedPlacements.south[0]));
  bad((d) => d.reservedPlacements.south.push("Bad Key"));
  bad((d) => (d.reservedPlacements.Bad = []));
});
