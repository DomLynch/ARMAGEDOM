import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { fixture } from "./helpers/rifle-fixture.js";
import { BOSS_EQUIPMENT_PROFILES as profiles } from "../src/engine/boss-equipment-data.js";
import { BOSS_EQUIPMENT_SAVE_KEY, PREVIOUS_BOSS_EQUIPMENT_SAVE_KEY } from "../src/engine/boss-equipment-core.js";
import { HUB_SAVE_KEY } from "../src/engine/hub-core.js";
import { RIFLE_SAVE_KEY } from "../src/engine/rifle-core.js";
import { stageProgressionDeath } from "../src/engine/progression-runtime.js";
import { issueSupply } from "../src/supplies.js";
// Differential definition of "no behaviour change" for the boss-equipment layer. The golden file was recorded from the
// pre-migration module on main; the migrated layer must replay it exactly (results, events, save bytes, live state).
// Re-record only with UPDATE_GOLDEN=1 and a written reason.
const goldenUrl = new URL("./fixtures/boss-equipment-golden.json", import.meta.url);
const sha = (raw) => (raw == null ? null : createHash("sha256").update(raw).digest("hex"));
const make = (options) => fixture({ extraWorld: { bossEquipmentData: profiles }, ...options });
const trace = {};
const legacy = JSON.parse(fs.readFileSync(new URL("./fixtures/rifle166-earned-v9.json", import.meta.url)));
const envelope = [
  "version",
  "pistol",
  "hp",
  "supplies",
  "vest",
  "droneDeaths",
  "animalCycle",
  "progression",
  "expedition",
  "uniqueReward",
  "flameFuel",
  "rifle",
  "bossEquipment",
];
function snapshot(f, field, step, result) {
  const g = f.g;
  return {
    step,
    result: result && { ok: result.ok, code: result.code, changed: result.changed, events: result.events },
    state: g.bossEquipment?.[field],
    weapon: g.player.weapon,
    pistolEquipped: g.pistol?.equipped,
    rifleSelected: g.rifle?.selected,
    flameEquipped: g.flame?.equipped,
    fuel: g.flameFuel,
    dropEvents: g.events.filter((e) => e.type === "boss-equipment-drop").length,
    saveSha: sha(f.records.get(HUB_SAVE_KEY)),
    keys: [...f.records.keys()].sort(),
  };
}
function kill(f, field) {
  const g = f.g,
    data = profiles[field],
    e = g.enemies.find((e) => e.placementKey === data.source.placementKey);
  assert(e, field);
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
}
const dispatch = (f, command) => f.p.dispatchBossEquipment(f.g, command, true);
function scenario(field) {
  const data = profiles[field],
    areaId = data.source.areaId,
    steps = [];
  const f = make({ areaId });
  f.restore();
  steps.push(snapshot(f, field, "fresh"));
  // A failed kill save keeps the award staged; recovery writes the drop once.
  kill(f, field);
  f.quota(true);
  steps.push({ ...snapshot(f, field, "kill-quota-fail"), persisted: f.p.persistRun(f.g) });
  f.quota(false);
  steps.push({ ...snapshot(f, field, "kill-persist"), persisted: f.p.persistRun(f.g) });
  steps.push(snapshot(f, field, "kill-persist-again"));
  const pending = f.g.bossEquipment[field].dropPosition;
  f.g.player.pos = { x: pending.x + 3, z: pending.z };
  steps.push(snapshot(f, field, "claim-too-far", dispatch(f, { type: "claimPickup", pickupId: data.itemId })));
  f.g.player.pos = { ...pending };
  f.quota(true);
  steps.push(snapshot(f, field, "claim-quota-fail", dispatch(f, { type: "claimPickup", pickupId: data.itemId })));
  f.quota(false);
  steps.push(snapshot(f, field, "claim", dispatch(f, { type: "claimPickup", pickupId: data.itemId })));
  steps.push(snapshot(f, field, "claim-again", dispatch(f, { type: "claimPickup", pickupId: data.itemId })));
  steps.push(snapshot(f, field, "equip-bad", dispatch(f, { type: "equip", itemId: data.itemId, equipped: "yes" })));
  steps.push(snapshot(f, field, "equip", dispatch(f, { type: "equip", itemId: data.itemId, equipped: true })));
  steps.push(snapshot(f, field, "equip-again", dispatch(f, { type: "equip", itemId: data.itemId, equipped: true })));
  if (["shotguns", "grenades", "launchers", "rifles"].includes(data.family)) {
    for (const [name, type] of [
      ["fire", "fire"],
      ["fire-too-soon", "fire"],
      ["reload", "reload"],
    ]) {
      if (name === "reload") {
        f.g.time += 5;
        f.g.tick += 300;
      } else if (name === "fire") {
        f.g.time += 1;
        f.g.tick += 60;
      }
      steps.push(snapshot(f, field, name, dispatch(f, { type, field })));
    }
    f.quota(true);
    f.g.time += 5;
    f.g.tick += 300;
    steps.push(snapshot(f, field, "fire-quota-fail", dispatch(f, { type: "fire", field })));
    f.quota(false);
  }
  steps.push(
    snapshot(
      f,
      field,
      "variant-select",
      f.p.dispatchUniqueReward?.(f.g, { type: "equip", itemId: "knife", equipped: true }),
    ),
  );
  steps.push(snapshot(f, field, "unequip", dispatch(f, { type: "equip", itemId: data.itemId, equipped: false })));
  steps.push(snapshot(f, field, "re-equip", dispatch(f, { type: "equip", itemId: data.itemId, equipped: true })));
  steps.push({ ...snapshot(f, field, "retry"), retried: f.p.retry() });
  steps.push(snapshot(f, field, "after-retry"));
  // Cold restore from the produced record.
  const cold = make({ areaId, records: new Map(f.records) });
  cold.restore();
  steps.push({ ...snapshot(cold, field, "cold-restore"), invalid: !!cold.g.runSaveInvalid });
  // Previous-era (v10) read: drop the launcher row and move the record to the previous key.
  // The outer hub record carries every layer's field; the boss layer's own envelope is that record cut to its field list.
  const hub = JSON.parse(f.records.get(HUB_SAVE_KEY)),
    v11 = Object.fromEntries(envelope.map((k) => [k, hub[k]]));
  v11.version = 11;
  const restoreFrom = (name, records) => {
    const r = make({ areaId, records: new Map(records) });
    r.restore();
    steps.push({ ...snapshot(r, field, name), invalid: !!r.g.runSaveInvalid });
  };
  restoreFrom("restore-v11-direct", [[BOSS_EQUIPMENT_SAVE_KEY, JSON.stringify(v11)]]);
  const v10 = structuredClone(v11);
  v10.version = 10;
  delete v10.bossEquipment.rocketLauncher;
  restoreFrom("restore-v10", [[PREVIOUS_BOSS_EQUIPMENT_SAVE_KEY, JSON.stringify(v10)]]);
  restoreFrom("restore-legacy-v9", [[RIFLE_SAVE_KEY, legacy.rawV9]]);
  const bad = structuredClone(v11);
  bad.bossEquipment[field].status = "bogus";
  restoreFrom("restore-tampered", [[BOSS_EQUIPMENT_SAVE_KEY, JSON.stringify(bad)]]);
  const extra = { ...v11, surprise: 1 };
  restoreFrom("restore-open-envelope", [[BOSS_EQUIPMENT_SAVE_KEY, JSON.stringify(extra)]]);
  return steps;
}
for (const field of Object.keys(profiles))
  test(`boss-equipment layer replays its recorded behaviour for ${field}`, () => {
    trace[field] = JSON.parse(JSON.stringify(scenario(field)));
    if (process.env.UPDATE_GOLDEN === "1") return;
    const golden = JSON.parse(fs.readFileSync(goldenUrl, "utf8"));
    assert.deepEqual(trace[field], golden[field]);
  });
test("golden covers every registered profile", () => {
  if (process.env.UPDATE_GOLDEN === "1") {
    fs.mkdirSync(new URL("./fixtures/", import.meta.url), { recursive: true });
    fs.writeFileSync(goldenUrl, JSON.stringify(trace, null, 1) + "\n");
    return;
  }
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(goldenUrl, "utf8"))).sort(), Object.keys(profiles).sort());
});
