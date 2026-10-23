import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { createGame, stepGame } from "../src/combat.js";
import { createRunPersistence } from "../src/engine/run-core.js";
import { createAreaRegistry } from "../src/area-registry.js";
import { createGeometry } from "../src/world-geometry.js";
import { travelTo } from "../src/travel.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";
import { UNIQUE_REWARD_SAVE_KEY } from "../src/engine/unique-reward-core.js";
import { AREA_BOSS_SAVE_KEY } from "../src/engine/expedition-core.js";
import { CLEAVER_ITEM_ID } from "../src/engine/unique-reward-runtime.js";
// Differential definition of "no behaviour change" for the unique-reward (cleaver) layer. The golden was recorded from
// the pre-migration module; the migrated layer must replay it exactly. Re-record only with UPDATE_GOLDEN=1 and a reason.
const goldenUrl = new URL("./fixtures/unique-reward-golden.json", import.meta.url);
const read = (p) => JSON.parse(fs.readFileSync(new URL("../public/" + p, import.meta.url)));
const registry = createAreaRegistry({ manifest: read("world/manifest.json") });
const sha = (raw) => (raw == null ? null : createHash("sha256").update(raw).digest("hex"));
function fixture({ records = new Map(), enabled = true } = {}) {
  const raw = read("world/area-content.json");
  if (enabled) raw.uniqueReward = { version: 1, itemId: CLEAVER_ITEM_ID };
  else delete raw.uniqueReward;
  const data = validateAreaMetadata(raw, registry);
  let geometry = createGeometry(read("world/westminster/layout.json")),
    quota = false,
    g = null;
  const world = {
    areaId: "westminster", registry, spawn: { x: 0, z: -6 }, layout: { characterScale: 1.265 }, geometry,
    bossData: data.bossData, progressionData: data.progression, expeditionData: data.expedition,
    uniqueRewardData: data.uniqueRewardData, residentPlacements: data.residents, lootRules: data.lootRules,
    lineClear: (a, b) => geometry.lineClear(a, b), move: (p, d, r) => geometry.move(p, d, r), travelAt: () => null,
    async loadArea(id, entry) {
      this.areaId = id;
      geometry = createGeometry(read("world/" + id + "/layout.json"));
      this.geometry = geometry;
      return geometry.ground(entry ?? registry.get(id).entry);
    },
  };
  const fresh = () =>
    createGame(world, {
      pilot: "donor-knife", pistol: true, supplies: true, vest: true, areaResidents: true, openingGroup: false,
      residentPlacements: data.residents, animalVariants: true,
      encounter: { id: "hollow-scavengers", character: { rig: "hollow-scavenger", weapon: "knife", contactRig: "hero", bodyScale: 1 } },
    });
  const p = createRunPersistence({
    getRun: () => g, setRun: (next) => (g = next), createFreshRun: fresh,
    storage: { getItem: (key) => records.get(key) ?? null, setItem(key, raw) { if (quota) throw Error("quota"); records.set(key, raw); } },
  });
  g = fresh();
  return {
    get g() { return g; }, world, p, records, quota: (v) => (quota = v), restore: () => p.restoreSavedRun(g),
    tick(intent = {}) { stepGame(g, intent, 1 / 60, { dispatchPistol: p.dispatchPistol }); p.collectNearbySupplies(g, intent); return p.persistRun(g); },
    claim: (allowed = true) => p.dispatchUniqueReward(g, { type: "claimPickup", pickupId: CLEAVER_ITEM_ID }, allowed),
    equip: (itemId = CLEAVER_ITEM_ID, equipped = true, allowed = true) => p.dispatchUniqueReward(g, { type: "equip", itemId, equipped }, allowed),
  };
}
async function killHale(f, { failed = false } = {}) {
  f.g.player.pos = { ...f.g.pistol.pickupPos };
  f.tick({ actions: ["pickup"] });
  assert(f.g.pistol.collected);
  await travelTo(f.g, { areaId: "east" });
  const target = f.g.enemies.find((e) => e.placementKey === "east-roamer-2");
  assert(target && target.hp === 120);
  f.g.player.pos = { x: target.pos.x + 2, z: target.pos.z };
  if (failed) f.quota(true);
  for (let i = 0; i < 500 && target.hp > 0; i++)
    f.tick({ actions: ["fire"], aim: { x: target.pos.x - f.g.player.pos.x, z: target.pos.z - f.g.player.pos.z } });
  assert.equal(target.hp, 0);
}
function idle(f) {
  for (let i = 0; i < 90 && (f.g.time < f.g.player.hurtUntil || f.g.player.swing); i++) f.tick();
}
function snapshot(f, step, result) {
  const g = f.g;
  return {
    step,
    result: result && { ok: result.ok, code: result.code, changed: result.changed, events: result.events },
    state: g.uniqueReward,
    weapon: g.player.weapon,
    pistolEquipped: g.pistol?.equipped,
    area: f.world.areaId,
    dropEvents: g.events.filter((e) => e.type === "unique-reward-drop").length,
    saveSha: sha(f.records.get(UNIQUE_REWARD_SAVE_KEY)),
    keys: [...f.records.keys()].sort(),
  };
}
async function scenario() {
  const steps = [],
    f = fixture();
  f.restore();
  steps.push(snapshot(f, "fresh"));
  await killHale(f, { failed: true });
  steps.push({ ...snapshot(f, "kill-quota-fail"), persistedWhileFailing: f.p.persistRun(f.g) });
  f.quota(false);
  steps.push({ ...snapshot(f, "kill-persist"), persisted: f.p.persistRun(f.g) });
  steps.push({ ...snapshot(f, "kill-persist-again"), persisted: f.p.persistRun(f.g) });
  idle(f);
  const at = { ...f.g.uniqueReward.dropPosition };
  f.g.player.pos = { x: at.x + 3, z: at.z };
  steps.push(snapshot(f, "claim-too-far", f.claim()));
  f.g.player.pos = { ...at };
  steps.push(snapshot(f, "claim-not-allowed", f.claim(false)));
  f.g.player.swing = {};
  steps.push(snapshot(f, "claim-mid-swing", f.claim()));
  f.g.player.swing = null;
  f.quota(true);
  steps.push(snapshot(f, "claim-quota-fail", f.claim()));
  f.quota(false);
  steps.push(snapshot(f, "claim", f.claim()));
  steps.push(snapshot(f, "claim-again", f.claim()));
  f.g.player.swing = {};
  steps.push(snapshot(f, "equip-mid-swing", f.equip()));
  f.g.player.swing = null;
  f.quota(true);
  steps.push(snapshot(f, "equip-quota-fail", f.equip()));
  f.quota(false);
  steps.push(snapshot(f, "equip-not-allowed", f.equip(CLEAVER_ITEM_ID, true, false)));
  steps.push(snapshot(f, "equip-unequip-flag", f.equip(CLEAVER_ITEM_ID, false)));
  steps.push(snapshot(f, "equip-cleaver", f.equip()));
  steps.push(snapshot(f, "equip-cleaver-again", f.equip()));
  steps.push(snapshot(f, "equip-knife", f.equip("knife")));
  steps.push(snapshot(f, "equip-cleaver-last", f.equip()));
  steps.push({ ...snapshot(f, "retry"), retried: f.p.retry() });
  steps.push(snapshot(f, "after-retry"));
  await travelTo(f.g, { areaId: "westminster" });
  steps.push({ ...snapshot(f, "reenter-west"), persisted: f.p.persistRun(f.g) });
  const restoreFrom = (name, records, enabled = true) => {
    const r = fixture({ records: new Map(records), enabled });
    r.restore();
    steps.push({ ...snapshot(r, name), invalid: !!r.g.runSaveInvalid, retryDenied: !r.p.retry() });
  };
  restoreFrom("cold-restore", f.records);
  const v7 = JSON.parse(f.records.get(UNIQUE_REWARD_SAVE_KEY));
  const bad = structuredClone(v7);
  bad.uniqueReward.status = "bogus";
  restoreFrom("restore-tampered", [[UNIQUE_REWARD_SAVE_KEY, JSON.stringify(bad)]]);
  restoreFrom("restore-open-envelope", [[UNIQUE_REWARD_SAVE_KEY, JSON.stringify({ ...v7, surprise: 1 })]]);
  for (const dead of [false, true]) {
    const old = fixture({ enabled: false });
    old.restore();
    if (dead) await killHale(old);
    const raw6 = old.records.get(AREA_BOSS_SAVE_KEY);
    restoreFrom(dead ? "restore-v6-dead" : "restore-v6-alive", [[AREA_BOSS_SAVE_KEY, raw6]]);
    restoreFrom(dead ? "restore-v6-dead-with-bad-v7" : "restore-v6-alive-with-bad-v7", [[AREA_BOSS_SAVE_KEY, raw6], [UNIQUE_REWARD_SAVE_KEY, "{bad"]]);
  }
  return steps;
}
test("unique-reward layer replays its recorded behaviour", async () => {
  const trace = JSON.parse(JSON.stringify(await scenario()));
  if (process.env.UPDATE_GOLDEN === "1") {
    fs.writeFileSync(goldenUrl, JSON.stringify(trace, null, 1) + "\n");
    return;
  }
  assert.deepEqual(trace, JSON.parse(fs.readFileSync(goldenUrl, "utf8")));
});
