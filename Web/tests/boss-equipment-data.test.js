import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  BOSS_EQUIPMENT_PROFILES,
  SURGEON_KNIFE_PROFILE,
  EMBER_PROJECTOR_PROFILE,
} from "../src/engine/boss-equipment-data.js";
import { BONE_SAW_RULES, BONE_SAW_ITEM_ID } from "../src/engine/bone-saw.js";
import { GAME_DATA, buildGameData, validateBossEquipment } from "../src/engine/game-data.js";

// Fixture dumped from the code-literal modules before the move (weapons.json `bossEquipment`).
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/boss-equipment-pre-data.json", import.meta.url)));

test("boss equipment profiles built from data equal the pre-data literals, in the same field order", () => {
  assert.deepEqual(Object.keys(BOSS_EQUIPMENT_PROFILES), old.order);
  assert.deepEqual(JSON.parse(JSON.stringify(BOSS_EQUIPMENT_PROFILES)), old.profiles);
  for (const [field, row] of Object.entries(old.profiles))
    assert.equal(JSON.stringify(BOSS_EQUIPMENT_PROFILES[field]), JSON.stringify(row), `${field} key order`);
});

test("Surgeon, Ember, Bone Saw rules and item id equal the pre-data values", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(SURGEON_KNIFE_PROFILE)), old.surgeon);
  assert.deepEqual(JSON.parse(JSON.stringify(EMBER_PROJECTOR_PROFILE)), old.ember);
  assert.deepEqual(JSON.parse(JSON.stringify(BONE_SAW_RULES)), old.boneSawRules);
  assert.equal(BONE_SAW_ITEM_ID, old.boneSawItemId);
  assert.equal(SURGEON_KNIFE_PROFILE, BOSS_EQUIPMENT_PROFILES.surgicalKnife);
  assert.equal(EMBER_PROJECTOR_PROFILE, BOSS_EQUIPMENT_PROFILES.emberProjector);
});

test("profiles stay frozen like the literals were", () => {
  assert(Object.isFrozen(BOSS_EQUIPMENT_PROFILES));
  for (const row of [SURGEON_KNIFE_PROFILE, EMBER_PROJECTOR_PROFILE]) {
    assert(Object.isFrozen(row) && Object.isFrozen(row.rules) && Object.isFrozen(row.source));
  }
});

test("the loader refuses a bad boss equipment section", () => {
  const good = () => structuredClone(GAME_DATA.weapons.bossEquipment),
    ranged = GAME_DATA.weapons.ranged;
  validateBossEquipment(good(), ranged);
  const cases = {
    "order drops a field": (b) => b.order.pop(),
    "unknown ranged weapon": (b) => (b.ranged.shotgun = "nope"),
    "extra field": (b) => (b.extra = 1),
    "rule not a number": (b) => (b.boneSawRules.damage = "5"),
    "empty receipt": (b) => (b.emberProjector.source.receiptId = ""),
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const b = good();
    mutate(b);
    assert.throws(() => validateBossEquipment(b, ranged), TypeError, name);
  }
  assert(buildGameData());
});
