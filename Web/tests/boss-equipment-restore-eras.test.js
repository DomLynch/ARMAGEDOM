import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fixture } from "./helpers/rifle-fixture.js";
import { BOSS_EQUIPMENT_PROFILES as profiles } from "../src/engine/boss-equipment-data.js";
import {
  BOSS_EQUIPMENT_LAYER,
  BOSS_EQUIPMENT_SAVE_KEY,
  PREVIOUS_BOSS_EQUIPMENT_SAVE_KEY,
  createBossEquipmentComponent,
} from "../src/engine/boss-equipment-core.js";
import { HUB_SAVE_KEY } from "../src/engine/hub-core.js";
import { stageProgressionDeath } from "../src/engine/progression-runtime.js";
import { issueSupply } from "../src/supplies.js";
// Era table for the boss-equipment codec: what the differential golden does not pin. The layer is built alone on a
// stub base (the real layers above it have their own conversions and mask this one), a crafted record set is read
// through its own storage adapter, and its codec says whether the record loads. Outcomes were checked against the
// pre-migration layer on main.
const BASE_KEY = "base-key";
const legacy = JSON.parse(fs.readFileSync(new URL("./fixtures/rifle166-earned-v9.json", import.meta.url)));
const json = JSON.stringify;
const rocket = profiles.rocketLauncher.itemId;
function read(records) {
  const baseCodec = {
    RUN_SAVE_KEY: BASE_KEY,
    PISTOL_SAVE_KEY: "pistol-key",
    encodeRun() {},
    restoreRun: (g, raw) => (raw == null ? null : JSON.parse(raw)),
  };
  const layer = createBossEquipmentComponent({
    baseCodec,
    getRun: () => null,
    profiles,
    applyBaseSaved() {},
    canDispatch: () => true,
    validatedDropPosition() {},
    sourceDead: () => false,
  });
  const store = new Map(records),
    adapter = layer.storageAdapter({ getItem: (key) => store.get(key) ?? null, setItem() {} });
  return layer.codec.restoreRun({}, adapter.getItem(BOSS_EQUIPMENT_SAVE_KEY), null);
}
// A real run that owns and has selected `field`, as v11 and v10 envelopes cut from the written record.
function earned(field) {
  const data = profiles[field],
    f = fixture({ areaId: data.source.areaId, extraWorld: { bossEquipmentData: profiles } });
  f.restore();
  const g = f.g,
    e = g.enemies.find((e) => e.placementKey === data.source.placementKey);
  e.hp = 0;
  g.supplies = issueSupply(g.supplies, {
    areaId: f.world.areaId,
    placementKey: e.placementKey,
    position: e.pos,
    hp: 0,
    rules: g.lootRules,
    cycle: g.animalCycle,
  }).state;
  stageProgressionDeath(g, e, "knife", e.maxHP);
  g.corpses.push(e);
  assert(f.p.persistRun(g));
  g.player.pos = { ...g.bossEquipment[field].dropPosition };
  assert(f.p.dispatchBossEquipment(g, { type: "claimPickup", pickupId: data.itemId }, true).ok);
  assert(f.p.dispatchBossEquipment(g, { type: "equip", itemId: data.itemId, equipped: true }, true).ok);
  const hub = JSON.parse(f.records.get(HUB_SAVE_KEY)),
    v11 = Object.assign(Object.fromEntries(BOSS_EQUIPMENT_LAYER.envelope.map((k) => [k, hub[k]])), { version: 11 }),
    v10 = structuredClone(v11);
  v10.version = 10;
  delete v10.bossEquipment.rocketLauncher;
  return { v11, v10 };
}
const withAward = (record, weaponId) => {
  const copy = structuredClone(record);
  copy.progression.awards = [...(copy.progression.awards ?? []), { weaponId, placementKey: "x", areaId: "x" }];
  return copy;
};
const withHp = (record, hp) => ({ ...structuredClone(record), hp });

test("launcher receipt is refused in v10 and legacy records, which could not contain it", () => {
  const { v10 } = earned("shotgun");
  assert(read([[PREVIOUS_BOSS_EQUIPMENT_SAVE_KEY, json(v10)]]), "control");
  assert.equal(read([[PREVIOUS_BOSS_EQUIPMENT_SAVE_KEY, json(withAward(v10, rocket))]]), null);
  assert(read([[BASE_KEY, legacy.rawV9]]), "control");
  assert.equal(read([[BASE_KEY, json(withAward(JSON.parse(legacy.rawV9), rocket))]]), null);
});
test("an item introduced by this layer cannot appear in a legacy record", () => {
  for (const field of ["shotgun", "grenade", "surgicalKnife", "commanderPistol", "emberProjector"])
    for (const raw of [legacy.rawV9, legacy.rawV8])
      assert.equal(read([[BASE_KEY, json(withAward(JSON.parse(raw), profiles[field].itemId))]]), null, field);
});
test("key priority: v11 beats v10 beats legacy", () => {
  const { v11, v10 } = earned("shotgun");
  const all = read([
    [BOSS_EQUIPMENT_SAVE_KEY, json(withHp(v11, 111))],
    [PREVIOUS_BOSS_EQUIPMENT_SAVE_KEY, json(withHp(v10, 122))],
    [BASE_KEY, legacy.rawV9],
  ]);
  const noV11 = read([
    [PREVIOUS_BOSS_EQUIPMENT_SAVE_KEY, json(withHp(v10, 122))],
    [BASE_KEY, legacy.rawV9],
  ]);
  const onlyLegacy = read([[BASE_KEY, legacy.rawV9]]);
  assert.equal(all.hp, 111);
  assert.equal(noV11.hp, 122);
  assert.equal(onlyLegacy.hp, JSON.parse(legacy.rawV9).hp);
  assert.equal(all.bossEquipment.shotgun.status, "owned");
  assert.equal(noV11.bossEquipment.rocketLauncher.status, "eligible", "v10 gets a fresh launcher row");
  assert.equal(onlyLegacy.bossEquipment.shotgun.status, "eligible", "legacy has no boss-equipment history");
});
test("an era record under the wrong key, with the wrong version, or with extra fields is refused", () => {
  const { v11, v10 } = earned("shotgun");
  assert(read([[BOSS_EQUIPMENT_SAVE_KEY, json(v11)]]), "control v11");
  assert(read([[PREVIOUS_BOSS_EQUIPMENT_SAVE_KEY, json(v10)]]), "control v10");
  assert.equal(read([[PREVIOUS_BOSS_EQUIPMENT_SAVE_KEY, json(v11)]]), null, "v11 under the v10 key");
  assert.equal(read([[BOSS_EQUIPMENT_SAVE_KEY, json(v10)]]), null, "v10 under the v11 key");
  assert.equal(read([[BOSS_EQUIPMENT_SAVE_KEY, json({ ...v11, version: 12 })]]), null);
  assert.equal(read([[BOSS_EQUIPMENT_SAVE_KEY, json({ ...v11, surprise: 1 })]]), null, "open envelope");
});
test("selected-state cross-checks against the rest of the record", () => {
  const shot = earned("shotgun").v11,
    pistol = earned("commanderPistol").v11,
    ember = earned("emberProjector").v11,
    load = (record, change) => {
      const copy = structuredClone(record);
      change(copy);
      return read([[BOSS_EQUIPMENT_SAVE_KEY, json(copy)]]);
    };
  for (const record of [shot, pistol, ember])
    assert(
      load(record, () => {}),
      "control",
    );
  assert.equal(
    load(shot, (c) => (c.pistol = { ...c.pistol, equipped: true })),
    null,
    "item while pistol equipped",
  );
  assert.equal(
    load(shot, (c) => (c.rifle = { ...c.rifle, selected: true })),
    null,
    "item while rifle selected",
  );
  // The Marshal railgun is the "rifles" family: like every non-"pistols" item it must not coexist with an equipped pistol.
  assert.equal(
    load(pistol, (c) => (c.pistol = { ...c.pistol, equipped: true })),
    null,
    "railgun while pistol equipped",
  );
  assert.equal(
    load(ember, (c) => (c.flameFuel = { ...c.flameFuel, collected: false })),
    null,
    "no collected fuel",
  );
});
