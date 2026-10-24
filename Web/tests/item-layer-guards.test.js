import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fixture } from "./helpers/rifle-fixture.js";
import { createGame, stepGame } from "../src/combat.js";
import { createRunPersistence } from "../src/engine/run-core.js";
import { createAreaRegistry } from "../src/area-registry.js";
import { createGeometry } from "../src/world-geometry.js";
import { travelTo } from "../src/travel.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";
import { BOSS_EQUIPMENT_PROFILES as profiles } from "../src/engine/boss-equipment-data.js";
import { stageProgressionDeath } from "../src/engine/progression-runtime.js";
import { issueSupply } from "../src/supplies.js";
import { RIFLE_ITEM_ID } from "../src/engine/weapon-catalog.js";
import { CLEAVER_ITEM_ID } from "../src/engine/unique-reward-runtime.js";
// Guard steps for the shared "may this run change equipment" and "is this pickup reachable" rules. The golden was
// recorded from the pre-migration layers on main; every item layer must replay it exactly. Each step changes ONE thing
// about the run, tries the command, and puts the run back. Re-record only with UPDATE_GOLDEN=1 and a written reason.
const goldenUrl = new URL("./fixtures/item-layer-guards-golden.json", import.meta.url);
const read = (p) => JSON.parse(fs.readFileSync(new URL("../public/" + p, import.meta.url)));
const result = (r) => ({ ok: r.ok, code: r.code });
// name -> [mutate(g, world) -> restore()]
const GUARDS = {
  "mid-swing": (g) => ((g.player.swing = {}), () => (g.player.swing = null)),
  hurt: (g) => {
    const old = g.player.hurtUntil;
    g.player.hurtUntil = g.time + 5;
    return () => (g.player.hurtUntil = old);
  },
  dodging: (g) => {
    const old = g.player.dodgeUntil;
    g.player.dodgeUntil = g.time + 5;
    return () => (g.player.dodgeUntil = old);
  },
  "before-ready": (g) => {
    const old = g.player.ready;
    g.player.ready = g.time + 5;
    return () => (g.player.ready = old);
  },
  "save-invalid": (g) => ((g.runSaveInvalid = true), () => delete g.runSaveInvalid),
  finished: (g) => ((g.finished = true), () => (g.finished = false)),
  dead: (g) => {
    const hp = g.player.hp;
    g.player.hp = 0;
    return () => (g.player.hp = hp);
  },
  "negative-time": (g) => {
    const t = g.time;
    g.time = -1;
    return () => (g.time = t);
  },
  "time-not-finite": (g) => {
    const t = g.time;
    g.time = NaN;
    return () => (g.time = t);
  },
};
// Only the rifle and cleaver runs replay these (the boss golden predates them and its layer is already migrated).
// With time below zero and every timer below zero too, only the layers' `nonNegativeTime` flag still refuses.
const LAYER_GUARDS = {
  ...GUARDS,
  "timers-below-zero": (g) => {
    const p = g.player,
      old = [g.time, p.ready, p.hurtUntil, p.dodgeUntil];
    [g.time, p.ready, p.hurtUntil, p.dodgeUntil] = [-1, -2, -2, -2];
    return () => ([g.time, p.ready, p.hurtUntil, p.dodgeUntil] = old);
  },
};
const WORLD_GUARDS = {
  "wrong-area": (w) => {
    const old = w.areaId;
    w.areaId = "elsewhere";
    return () => (w.areaId = old);
  },
  "blocked-line": (w) => {
    const old = w.lineClear;
    w.lineClear = () => false;
    return () => (w.lineClear = old);
  },
};
// A command that is allowed would change the run; every probe puts the run back so steps stay independent.
const SNAP = [
  "bossEquipment",
  "pistol",
  "rifle",
  "rifleAction",
  "uniqueReward",
  "flameFuel",
  "flame",
  "bossEquipmentAction",
];
const isolated =
  (g, fn) =>
  (...args) => {
    const saved = Object.fromEntries(SNAP.map((k) => [k, structuredClone(g[k])])),
      weapon = g.player.weapon;
    try {
      return fn(...args);
    } finally {
      for (const k of SNAP) g[k] = saved[k];
      g.player.weapon = weapon;
    }
  };
function runGuards(g, world, claimAt, claim, radius, guards = GUARDS) {
  const steps = {};
  for (const [name, mutate] of Object.entries(guards)) {
    const restore = mutate(g, world);
    steps[name] = result(claim());
    restore();
  }
  for (const [name, mutate] of Object.entries(WORLD_GUARDS)) {
    const restore = mutate(world);
    steps[name] = result(claim());
    restore();
  }
  steps["not-allowed"] = result(claim(false));
  // Pickup radius and its tolerance, with the line forced clear so only distance decides.
  const clear = world.lineClear;
  world.lineClear = () => true;
  for (const [name, d] of [
    ["radius-minus", radius - 1e-3],
    ["radius-exact", radius],
    ["radius-plus-half-epsilon", radius + 5e-9],
    ["radius-plus-epsilon", radius + 1e-8],
    ["radius-plus-two-epsilon", radius + 2e-8],
    ["radius-plus-half-metre", radius + 0.5],
  ]) {
    g.player.pos = { x: claimAt.x + d, z: claimAt.z };
    steps[name] = result(claim());
  }
  g.player.pos = { x: NaN, z: claimAt.z };
  steps["position-nan"] = result(claim());
  g.player.pos = undefined;
  steps["position-missing"] = result(claim());
  world.lineClear = clear;
  g.player.pos = { ...claimAt };
  return steps;
}
function bossRun(field) {
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
  const at = { ...g.bossEquipment[field].dropPosition };
  g.player.pos = { ...at };
  const claim = (allowed = true) =>
    f.p.dispatchBossEquipment(g, { type: "claimPickup", pickupId: data.itemId }, allowed);
  const steps = { claim: runGuards(g, f.world, at, isolated(g, claim), data.rules.pickupRadius) };
  assert(claim().ok);
  assert(f.p.dispatchBossEquipment(g, { type: "equip", itemId: data.itemId, equipped: true }, true).ok);
  const equip = isolated(g, (allowed = true) =>
    f.p.dispatchBossEquipment(g, { type: "equip", itemId: data.itemId, equipped: false }, allowed),
  );
  const fire = isolated(g, (allowed = true) => f.p.dispatchBossEquipment(g, { type: "fire", field }, allowed));
  const guarded = {};
  for (const [name, mutate] of Object.entries(GUARDS)) {
    const restore = mutate(g, f.world);
    guarded[name] = { equip: result(equip()), fire: result(fire()) };
    restore();
  }
  steps.equipAndFire = guarded;
  return steps;
}
function rifleRun() {
  const f = fixture();
  f.restore();
  assert(f.kill());
  const at = { ...f.g.rifle.dropPosition },
    g = f.g;
  g.player.pos = { ...at };
  const claim = (allowed = true) => f.p.dispatchRifle(g, { type: "claimPickup", pickupId: RIFLE_ITEM_ID }, allowed);
  const steps = {
    claim: runGuards(g, f.world, at, isolated(g, claim), f.world.rifleData.rules.pickupRadius, LAYER_GUARDS),
  };
  assert(claim().ok);
  assert(f.equip(true).ok);
  const guarded = {},
    unequip = isolated(g, () => f.p.dispatchRifle(g, { type: "equip", itemId: RIFLE_ITEM_ID, equipped: false }, true)),
    shoot = isolated(g, () => f.fire());
  for (const [name, mutate] of Object.entries(LAYER_GUARDS)) {
    const restore = mutate(g, f.world);
    guarded[name] = { equip: result(unequip()), fire: result(shoot()) };
    restore();
  }
  steps.equipAndFire = guarded;
  steps.options = rifleOptions();
  return steps;
}
// What a run looks like after an option-flag probe: the command result and the layer's state.
const outcome = (g, key, ok) => ({
  ok,
  invalid: !!g.runSaveInvalid,
  hp: g.player.hp,
  finished: g.finished,
  weapon: g.player.weapon,
  [key]: structuredClone(g[key]),
});
// Probes for the layer option flags the steps above cannot reach: corpse area tag, retry candidate rules, restore
// while the save is invalid, snapshot of an invalid state, and a retry that would otherwise stage a drop.
const FRESH_RIFLE = {
  version: 1,
  status: "eligible",
  dropPosition: null,
  rewardReceipt: null,
  magazine: 0,
  reserve: 0,
  selected: false,
};
const FRESH_CLEAVER = {
  version: 1,
  status: "eligible",
  dropPosition: null,
  rewardReceipt: null,
  selectedMeleeVariant: "knife",
};
function rifleOptions() {
  const out = {};
  // A corpse stands in the source slot but is tagged with another area.
  let f = fixture();
  f.restore();
  const source = f.g.enemies.find((e) => e.placementKey === "boss-warden-v1");
  source.hp = 0;
  f.g.supplies = issueSupply(f.g.supplies, {
    areaId: f.world.areaId,
    placementKey: source.placementKey,
    position: source.pos,
    hp: 0,
    rules: f.g.lootRules,
    cycle: f.g.animalCycle,
  }).state;
  stageProgressionDeath(f.g, source, "knife", 120);
  f.g.corpses.push(source);
  // The award is already in the pending write (the first save fails) when the corpse turns out to be elsewhere.
  f.quota(true);
  out.firstSave = f.p.persistRun(f.g);
  f.quota(false);
  source.areaId = "elsewhere";
  out.corpseOtherArea = outcome(f.g, "rifle", f.p.persistRun(f.g));
  // A retry writes a fresh run; one that already carries a rifle record different from the live one is a candidate
  // conflict, which the rifle's retry is exempt from.
  f = fixture({ freshExtra: (run) => Object.assign(run, { rifle: { ...FRESH_RIFLE } }) });
  f.restore();
  assert(f.kill());
  assert(f.pickup().ok);
  assert(f.equip(true).ok);
  out.retryDisagrees = outcome(f.g, "rifle", f.p.retry());
  // The run's save is already invalid: only a restore may still go through.
  f = fixture();
  f.restore();
  assert(f.kill());
  f.g.runSaveInvalid = true;
  f.p.restoreSavedRun(f.g);
  out.restoreWhileInvalid = outcome(f.g, "rifle", !f.g.runSaveInvalid);
  // The rifle state is malformed when the run is saved.
  f = fixture();
  f.restore();
  f.g.rifle = { ...f.g.rifle, status: "bogus" };
  out.invalidState = outcome(f.g, "rifle", f.p.persistRun(f.g));
  // The kill's write fails; the retry must not stage the drop (a restore or retry never does).
  f = fixture();
  f.restore();
  f.quota(true);
  out.killQuotaFail = { killed: f.kill() };
  f.quota(false);
  out.retryAfterKill = outcome(f.g, "rifle", f.p.retry());
  return out;
}
const UNIQUE_OPTIONS = ["retryDisagrees", "restoreWhileInvalid", "invalidState", "retryAfterKill"];
// The killing blow staged by hand (without the save a real kill triggers), as `kill()` does in the rifle fixture.
function stageKill(g, target) {
  target.hp = 0;
  g.supplies = issueSupply(g.supplies, {
    areaId: g.world.areaId,
    placementKey: target.placementKey,
    position: target.pos,
    hp: 0,
    rules: g.lootRules,
    cycle: g.animalCycle,
  }).state;
  stageProgressionDeath(g, target, "knife", target.maxHP);
  g.corpses.push(target);
}
// The same option-flag probes as the rifle's, on the cleaver layer (see rifleOptions), minus the corpse-area one.
function uniqueOption(name, { g, p, target, kill, quota, freshWith }) {
  if (name === "retryAfterKill") {
    // The killing blow is staged by hand so the failing write is the one that would stage the drop.
    quota(true);
    stageKill(g, target);
    const persisted = p.persistRun(g);
    quota(false);
    return { persisted, ...outcome(g, "uniqueReward", p.retry()) };
  }
  kill();
  g.player.pos = { ...g.uniqueReward.dropPosition };
  if (name === "retryDisagrees") {
    assert(p.dispatchUniqueReward(g, { type: "claimPickup", pickupId: CLEAVER_ITEM_ID }, true).ok);
    // The fresh run a retry writes already carries a cleaver record different from the live one; the cleaver's retry
    // is not exempt from that conflict.
    freshWith(FRESH_CLEAVER);
    return outcome(g, "uniqueReward", p.retry());
  }
  if (name === "restoreWhileInvalid") {
    g.runSaveInvalid = true;
    p.restoreSavedRun(g);
    return outcome(g, "uniqueReward", !g.runSaveInvalid);
  }
  g.uniqueReward = { ...g.uniqueReward, status: "bogus" };
  return outcome(g, "uniqueReward", p.persistRun(g));
}
async function uniqueRun(option = null) {
  const registry = createAreaRegistry({ manifest: read("world/manifest.json") }),
    raw = read("world/area-content.json");
  raw.uniqueReward = { version: 1, itemId: CLEAVER_ITEM_ID };
  const data = validateAreaMetadata(raw, registry);
  let geometry = createGeometry(read("world/westminster/layout.json")),
    g = null;
  const records = new Map();
  let quota = false;
  const world = {
    areaId: "westminster",
    registry,
    spawn: { x: 0, z: -6 },
    layout: { characterScale: 1.265 },
    geometry,
    bossData: data.bossData,
    progressionData: data.progression,
    expeditionData: data.expedition,
    uniqueRewardData: data.uniqueRewardData,
    residentPlacements: data.residents,
    lootRules: data.lootRules,
    lineClear: (a, b) => geometry.lineClear(a, b),
    move: (p, d, r) => geometry.move(p, d, r),
    travelAt: () => null,
    async loadArea(id, entry) {
      this.areaId = id;
      geometry = createGeometry(read("world/" + id + "/layout.json"));
      this.geometry = geometry;
      return geometry.ground(entry ?? registry.get(id).entry);
    },
  };
  let freshRecord = null;
  const withFreshRecord = (run) => (freshRecord ? Object.assign(run, { uniqueReward: { ...freshRecord } }) : run);
  const fresh = () =>
    withFreshRecord(
      createGame(world, {
        pilot: "donor-knife",
        pistol: true,
        supplies: true,
        vest: true,
        areaResidents: true,
        openingGroup: false,
        residentPlacements: data.residents,
        animalVariants: true,
        encounter: {
          id: "hollow-scavengers",
          character: { rig: "hollow-scavenger", weapon: "knife", contactRig: "hero", bodyScale: 1 },
        },
      }),
    );
  const p = createRunPersistence({
    getRun: () => g,
    setRun: (next) => (g = next),
    createFreshRun: fresh,
    storage: {
      getItem: (key) => records.get(key) ?? null,
      setItem: (key, value) => {
        if (quota) throw Error("quota");
        records.set(key, value);
      },
    },
  });
  g = fresh();
  p.restoreSavedRun(g);
  const tick = (intent = {}) => {
    stepGame(g, intent, 1 / 60, { dispatchPistol: p.dispatchPistol });
    p.collectNearbySupplies(g, intent);
    return p.persistRun(g);
  };
  g.player.pos = { ...g.pistol.pickupPos };
  tick({ actions: ["pickup"] });
  await travelTo(g, { areaId: "east" });
  const target = g.enemies.find((e) => e.placementKey === "east-roamer-2");
  g.player.pos = { x: target.pos.x + 2, z: target.pos.z };
  const kill = () => {
    for (let i = 0; i < 500 && target.hp > 0; i++)
      tick({ actions: ["fire"], aim: { x: target.pos.x - g.player.pos.x, z: target.pos.z - g.player.pos.z } });
    assert.equal(target.hp, 0);
  };
  if (option)
    return uniqueOption(option, { g, p, target, kill, quota: (v) => (quota = v), freshWith: (v) => (freshRecord = v) });
  kill();
  for (let i = 0; i < 90 && (g.time < g.player.hurtUntil || g.player.swing); i++) tick();
  const at = { ...g.uniqueReward.dropPosition };
  g.player.pos = { ...at };
  const claim = (allowed = true) =>
    p.dispatchUniqueReward(g, { type: "claimPickup", pickupId: CLEAVER_ITEM_ID }, allowed);
  const steps = { claim: runGuards(g, world, at, isolated(g, claim), 1.3, LAYER_GUARDS) };
  assert(claim().ok);
  const equip = isolated(g, (itemId, allowed = true) =>
    p.dispatchUniqueReward(g, { type: "equip", itemId, equipped: true }, allowed),
  );
  const guarded = {};
  for (const [name, mutate] of Object.entries(LAYER_GUARDS)) {
    const restore = mutate(g, world);
    guarded[name] = { equip: result(equip(CLEAVER_ITEM_ID)) };
    restore();
  }
  steps.equip = guarded;
  steps.options = {};
  for (const name of UNIQUE_OPTIONS) steps.options[name] = await uniqueRun(name);
  return steps;
}
test("item layers replay the recorded guard behaviour", async () => {
  const trace = {};
  for (const field of Object.keys(profiles)) trace["boss:" + field] = bossRun(field);
  trace.rifle = rifleRun();
  trace.unique = await uniqueRun();
  const plain = JSON.parse(JSON.stringify(trace));
  if (process.env.UPDATE_GOLDEN === "1") {
    fs.writeFileSync(goldenUrl, JSON.stringify(plain, null, 1) + "\n");
    return;
  }
  assert.deepEqual(plain, JSON.parse(fs.readFileSync(goldenUrl, "utf8")));
});
