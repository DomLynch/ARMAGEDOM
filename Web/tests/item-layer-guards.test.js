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
function runGuards(g, world, claimAt, claim, radius) {
  const steps = {};
  for (const [name, mutate] of Object.entries(GUARDS)) {
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
  const steps = { claim: runGuards(g, f.world, at, isolated(g, claim), f.world.rifleData.rules.pickupRadius) };
  assert(claim().ok);
  assert(f.equip(true).ok);
  const guarded = {},
    unequip = isolated(g, () => f.p.dispatchRifle(g, { type: "equip", itemId: RIFLE_ITEM_ID, equipped: false }, true)),
    shoot = isolated(g, () => f.fire());
  for (const [name, mutate] of Object.entries(GUARDS)) {
    const restore = mutate(g, f.world);
    guarded[name] = { equip: result(unequip()), fire: result(shoot()) };
    restore();
  }
  steps.equipAndFire = guarded;
  return steps;
}
async function uniqueRun() {
  const registry = createAreaRegistry({ manifest: read("world/manifest.json") }),
    raw = read("world/area-content.json");
  raw.uniqueReward = { version: 1, itemId: CLEAVER_ITEM_ID };
  const data = validateAreaMetadata(raw, registry);
  let geometry = createGeometry(read("world/westminster/layout.json")),
    g = null;
  const records = new Map();
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
  const fresh = () =>
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
    });
  const p = createRunPersistence({
    getRun: () => g,
    setRun: (next) => (g = next),
    createFreshRun: fresh,
    storage: { getItem: (key) => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) },
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
  for (let i = 0; i < 500 && target.hp > 0; i++)
    tick({ actions: ["fire"], aim: { x: target.pos.x - g.player.pos.x, z: target.pos.z - g.player.pos.z } });
  assert.equal(target.hp, 0);
  for (let i = 0; i < 90 && (g.time < g.player.hurtUntil || g.player.swing); i++) tick();
  const at = { ...g.uniqueReward.dropPosition };
  g.player.pos = { ...at };
  const claim = (allowed = true) =>
    p.dispatchUniqueReward(g, { type: "claimPickup", pickupId: CLEAVER_ITEM_ID }, allowed);
  const steps = { claim: runGuards(g, world, at, isolated(g, claim), 1.3) };
  assert(claim().ok);
  const equip = isolated(g, (itemId, allowed = true) =>
    p.dispatchUniqueReward(g, { type: "equip", itemId, equipped: true }, allowed),
  );
  const guarded = {};
  for (const [name, mutate] of Object.entries(GUARDS)) {
    const restore = mutate(g, world);
    guarded[name] = { equip: result(equip(CLEAVER_ITEM_ID)) };
    restore();
  }
  steps.equip = guarded;
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
