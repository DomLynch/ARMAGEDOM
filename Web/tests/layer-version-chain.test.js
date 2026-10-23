import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers/rifle-fixture.js";
import { BOSS_EQUIPMENT_PROFILES as profiles } from "../src/engine/boss-equipment-data.js";
import { BOSS_EQUIPMENT_LAYER, BOSS_EQUIPMENT_SAVE_KEY, PREVIOUS_BOSS_EQUIPMENT_SAVE_KEY } from "../src/engine/boss-equipment-core.js";
import { RIFLE_SAVE_KEY } from "../src/engine/rifle-core.js";
import { FLAME_SAVE_KEY } from "../src/engine/flame-core.js";
import { HUB_SAVE_KEY } from "../src/engine/hub-core.js";
// Today's save chain, written down once. A layer migration must not change any of these values.
test("boss-equipment layer row keeps today's keys, versions and envelope verbatim", () => {
  assert.equal(BOSS_EQUIPMENT_SAVE_KEY, "armagedom:boss-equipment-run:v11");
  assert.equal(PREVIOUS_BOSS_EQUIPMENT_SAVE_KEY, "armagedom:boss-equipment-run:v10");
  assert.deepEqual(
    { v: BOSS_EQUIPMENT_LAYER.version, p: BOSS_EQUIPMENT_LAYER.previousVersion, b: BOSS_EQUIPMENT_LAYER.baseVersion },
    { v: 11, p: 10, b: 9 },
  );
  assert.deepEqual(BOSS_EQUIPMENT_LAYER.previousKeys, [{ key: PREVIOUS_BOSS_EQUIPMENT_SAVE_KEY, origin: "v10" }]);
  assert.deepEqual(BOSS_EQUIPMENT_LAYER.envelope, [
    "version", "pistol", "hp", "supplies", "vest", "droneDeaths", "animalCycle", "progression", "expedition",
    "uniqueReward", "flameFuel", "rifle", "bossEquipment",
  ]);
  assert.equal(BOSS_EQUIPMENT_LAYER.pickupEpsilon, 1e-8);
  assert.equal(RIFLE_SAVE_KEY, "armagedom:rifle-run:v9");
  assert.equal(FLAME_SAVE_KEY, "armagedom:flame-run:v8");
});
test("the written chain's outer record keeps version 17 and its key, with the boss envelope fields intact", () => {
  const f = fixture({ areaId: "south", extraWorld: { bossEquipmentData: profiles } });
  f.restore();
  assert(f.p.persistRun(f.g));
  assert.deepEqual([...f.records.keys()], [HUB_SAVE_KEY]);
  const record = JSON.parse(f.records.get(HUB_SAVE_KEY));
  assert.equal(record.version, 17);
  assert.deepEqual(Object.keys(record), BOSS_EQUIPMENT_LAYER.envelope);
});
