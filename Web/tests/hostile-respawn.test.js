import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createGame, stepGame } from "../src/combat.js";
import { createAreaRegistry } from "../src/area-registry.js";
import { createGeometry } from "../src/world-geometry.js";
import { validateAreaMetadata } from "../src/engine/area-content.js";
import { validatePopulationData } from "../src/engine/area-population.js";
import { createRunPersistence } from "../src/engine/run-core.js";
import { travelTo } from "../src/travel.js";
import { RESPAWN_SAVE_KEY, applyRespawnRecord, respawnable } from "../src/engine/respawn.js";

const read = (path) => JSON.parse(fs.readFileSync(new URL("../public/" + path, import.meta.url)));
const registry = createAreaRegistry({ manifest: read("world/manifest.json") });
const layout = (id) => read(registry.asset(registry.get(id).layoutRef).path);
const rawContent = () => read("world/area-content.json");
const options = {
  pilot: "donor-knife",
  pistol: true,
  supplies: true,
  vest: true,
  areaResidents: true,
  animalVariants: true,
  encounter: { id: "hollow-scavengers", character: { rig: "hollow-scavenger", weapon: "knife", contactRig: "hero", bodyScale: 1 } },
};
const ORDINARY = ["area8-resident-1", "area8-resident-3", "area8-resident-4"];
const ALL = [...ORDINARY, "boss-veteran-v1"];

function fixture({ area = "area8", records = new Map(), content = rawContent(), lineClear = () => true } = {}) {
  const data = validateAreaMetadata(content, registry);
  let g,
    geometry = createGeometry(layout(area));
  const world = {
    areaId: area,
    registry,
    spawn: geometry.ground(registry.get(area).entry),
    layout: { characterScale: 1.265 },
    geometry,
    bossData: data.bossData,
    progressionData: data.progression,
    expeditionData: data.expedition,
    uniqueRewardData: data.uniqueRewardData,
    populationData: data.populationData,
    residentPlacements: data.residents,
    lootRules: data.lootRules,
    lineClear: (a, b) => lineClear(a, b),
    move: (p, d) => ({ x: p.x + d.x, z: p.z + d.z }),
    travelAt: () => null,
    async loadArea(id, entry) {
      this.areaId = id;
      geometry = createGeometry(layout(id));
      this.geometry = geometry;
      return geometry.ground(entry ?? registry.get(id).entry);
    },
  };
  const fresh = () => createGame(world, { ...options, residentPlacements: data.residents });
  g = fresh();
  const p = createRunPersistence({
    getRun: () => g,
    setRun: (next) => (g = next),
    createFreshRun: fresh,
    storage: { getItem: (key) => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) },
  });
  return {
    get g() {
      return g;
    },
    world,
    data,
    p,
    records,
  };
}
// A real pistol kill at range, so the genuine kill path (ledgers and respawn record) runs.
function kill(f, enemy) {
  const g = f.g;
  enemy.hp = 1;
  g.player.pos = { x: enemy.pos.x, z: enemy.pos.z - 10 };
  g.player.facing = { x: 0, z: 1 };
  Object.assign(g.pistol, { collected: true, equipped: true, magazine: 6, nextFireAt: g.time });
  stepGame(g, { actions: ["fire"], manualPistolAim: true, aim: { x: 0, z: 1 } });
  assert.ok(!g.enemies.includes(enemy), "the shot must kill " + enemy.placementKey);
  assert.ok(f.p.persistRun(g));
}
function clearOrdinary(f) {
  for (const enemy of f.g.enemies.filter((e) => !e.bossProfile)) kill(f, enemy);
}
const keysOf = (g) => g.enemies.map((e) => e.placementKey).sort();
const ledgers = (g) => JSON.stringify([g.supplies.issued, g.progression.awards, g.droneDeaths]);
const placement = (f, key) => f.data.residents.area8.find((row) => row.key === key).pos;
const standAt = (g, pos, dx, dz = 0) => (g.player.pos = { x: pos.x + dx, z: pos.z + dz });
// Far from every placement, so nothing is blocked.
const far = (g) => (g.player.pos = { x: 5000, z: 5000 });
const ticks = (g, n = 3) => {
  for (let i = 0; i < n; i++) stepGame(g, {});
};

test("shipped data: 180 s, 10 m and 25 m guards, tutorial excluded; bad values fail", () => {
  const content = rawContent();
  assert.deepEqual(content.population.respawn, {
    seconds: 180,
    minPlayerDistance: 10,
    offscreenDistance: 25,
    excludedAreas: ["westminster"],
  });
  const { residents, populationData } = validateAreaMetadata(content, registry);
  assert.deepEqual(populationData.respawn, content.population.respawn);
  const good = content.population.respawn;
  for (const respawn of [
    { ...good, seconds: 5 },
    { ...good, seconds: "180" },
    { ...good, minPlayerDistance: 0 },
    { ...good, offscreenDistance: 5 },
    { ...good, excludedAreas: ["nowhere"] },
    { ...good, excludedAreas: ["westminster", "westminster"] },
    { seconds: 180, excludedAreas: [] },
    { ...good, extra: 1 },
  ])
    assert.throws(() => validatePopulationData({ ...content.population, respawn }, registry, residents, null), /Invalid/);
  const { respawn, ...older } = content.population;
  assert.equal(validatePopulationData(older, registry, residents, null).respawn, undefined);
});

test("hostiles respawn 180 s after the kill while the player stays in the area", () => {
  const f = fixture();
  clearOrdinary(f);
  assert.deepEqual(keysOf(f.g), ["boss-veteran-v1"]);
  const before = ledgers(f.g);
  far(f.g);
  f.g.time += 170;
  ticks(f.g);
  assert.deepEqual(keysOf(f.g), ["boss-veteran-v1"], "too early");
  f.g.time += 20;
  ticks(f.g);
  assert.deepEqual(keysOf(f.g), ALL);
  assert.equal(f.g.encounterCleared, false, "the area line follows the live count");
  assert.equal(f.g.encounterActive, true);
  assert.ok(f.g.enemies.every((e) => e.hp > 0));
  assert.deepEqual(f.g.corpses.map((c) => c.placementKey).filter((k) => ORDINARY.includes(k)), []);
  assert.equal(ledgers(f.g), before, "permanent ledgers untouched");
});

test("a spawn waits while the player is within 10 m of the placement and never appears in plain view", () => {
  const f = fixture();
  clearOrdinary(f);
  const spot = placement(f, "area8-resident-1");
  f.g.time += 400;
  standAt(f.g, spot, 4);
  ticks(f.g);
  assert.ok(!keysOf(f.g).includes("area8-resident-1"), "within 10 m");
  standAt(f.g, spot, 15);
  ticks(f.g);
  assert.ok(!keysOf(f.g).includes("area8-resident-1"), "10 to 25 m with a clear line is on screen");
  standAt(f.g, spot, 30);
  ticks(f.g);
  assert.ok(keysOf(f.g).includes("area8-resident-1"), "far away");
});

test("a wall between player and placement allows a spawn beyond 10 m, but never within it", () => {
  let wall = false;
  const f = fixture({ lineClear: () => !wall });
  clearOrdinary(f);
  wall = true;
  const spot = placement(f, "area8-resident-1");
  f.g.time += 400;
  standAt(f.g, spot, 5);
  ticks(f.g);
  assert.ok(!keysOf(f.g).includes("area8-resident-1"), "5 m behind a wall is still too close");
  standAt(f.g, spot, 15);
  ticks(f.g);
  assert.ok(keysOf(f.g).includes("area8-resident-1"), "15 m behind a wall is off-screen");
});

test("a respawned hostile pays no second reward, award or loot instance and its next kill restarts the delay", () => {
  const f = fixture();
  clearOrdinary(f);
  f.g.time += 400;
  far(f.g);
  ticks(f.g);
  const before = ledgers(f.g),
    kills = f.g.kills,
    first = f.g.enemies.find((e) => e.placementKey === "area8-resident-1");
  assert.ok(first);
  kill(f, first);
  assert.equal(ledgers(f.g), before, "no extra supply issue, award or drone death");
  assert.equal(f.g.pendingProgressionDeaths.length, 0);
  assert.equal(f.g.kills, kills + 1);
  far(f.g);
  f.g.time += 100;
  ticks(f.g);
  assert.ok(!keysOf(f.g).includes("area8-resident-1"));
  f.g.time += 100;
  ticks(f.g);
  assert.ok(keysOf(f.g).includes("area8-resident-1"));
});

test("bosses never respawn: no record, and they stay dead after any delay", () => {
  const f = fixture();
  const boss = f.g.enemies.find((e) => e.bossProfile);
  assert.equal(respawnable(f.g, boss), false);
  assert.equal(respawnable(f.g, { placementKey: "area8-resident-1", rig: "hollow-scavenger" }), true);
  assert.equal(respawnable(f.g, { placementKey: "east-roamer-2", rig: "hollow-scavenger" }), false, "the unique-reward holder");
  assert.equal(respawnable(f.g, { placementKey: "area8-resident-1", rig: "low-hover-drone" }), false, "drones");
  assert.equal(respawnable(f.g, { placementKey: "area8-resident-1", rig: "hollow-scavenger", markedHunter: true }), false);
  clearOrdinary(f);
  kill(f, boss);
  assert.equal(f.g.respawn.kills[boss.placementKey], undefined);
  assert.deepEqual(Object.keys(f.g.respawn.kills).sort(), ORDINARY);
  f.g.time += 5000;
  far(f.g);
  ticks(f.g);
  assert.deepEqual(keysOf(f.g), ORDINARY, "ordinary hostiles are back, the boss is not");
});

test("the Westminster tutorial area never respawns", () => {
  const f = fixture({ area: "westminster" });
  const ordinary = f.g.enemies.filter((e) => !e.bossProfile);
  assert.ok(ordinary.length > 0);
  for (const e of ordinary) assert.equal(respawnable(f.g, e), false);
  const left = keysOf(f.g).filter((k) => !ordinary.some((e) => e.placementKey === k));
  for (const enemy of ordinary) kill(f, enemy);
  assert.equal(f.g.respawn, undefined, "nothing recorded");
  f.g.time += 5000;
  far(f.g);
  ticks(f.g);
  assert.deepEqual(keysOf(f.g), left);
});

test("no policy means no respawn at all (older data and fixtures)", () => {
  const content = rawContent();
  delete content.population.respawn;
  const f = fixture({ content });
  clearOrdinary(f);
  assert.equal(f.g.respawn, undefined);
  f.g.time += 5000;
  far(f.g);
  ticks(f.g);
  assert.deepEqual(keysOf(f.g), ["boss-veteran-v1"]);
});

test("travelling away and back also respawns what is due, and delays what would appear on top of the player", async () => {
  const f = fixture();
  clearOrdinary(f);
  await travelTo(f.g, { areaId: "lambeth" });
  f.g.time += 400;
  await travelTo(f.g, { areaId: "area8" });
  const back = keysOf(f.g).filter((k) => ORDINARY.includes(k));
  for (const key of ORDINARY) {
    const d = Math.hypot(placement(f, key).x - f.g.player.pos.x, placement(f, key).z - f.g.player.pos.z);
    // lineClear is open in this fixture, so anything inside 25 m would be in plain view and must wait.
    assert.equal(back.includes(key), d >= 25, key + " at " + d);
  }
  far(f.g);
  ticks(f.g);
  assert.deepEqual(keysOf(f.g), ALL);
});

test("kill times survive save and load: a cold start respawns after the delay, not before", () => {
  const records = new Map();
  const f = fixture({ records });
  f.p.restoreSavedRun(f.g);
  clearOrdinary(f);
  const stored = JSON.parse(records.get(RESPAWN_SAVE_KEY));
  assert.equal(stored.version, "v1");
  assert.deepEqual(Object.keys(stored.kills).sort(), ORDINARY);
  const early = fixture({ records: new Map(records) });
  early.p.restoreSavedRun(early.g);
  assert.deepEqual(early.g.respawn.kills, stored.kills);
  assert.equal(early.g.respawn.dirty, false);
  assert.deepEqual(keysOf(early.g), ["boss-veteran-v1"], "the permanent ledgers still keep them dead after load");
  early.g.time += 60;
  far(early.g);
  ticks(early.g);
  assert.deepEqual(keysOf(early.g), ["boss-veteran-v1"]);
  const late = fixture({ records: new Map(records) });
  late.p.restoreSavedRun(late.g);
  late.g.time += 400;
  far(late.g);
  ticks(late.g);
  assert.deepEqual(keysOf(late.g), ALL);
  assert.equal(ledgers(late.g), ledgers(early.g), "the permanent ledgers restored identically");
});

test("play time carries across sessions: time already played counts towards the delay", () => {
  const records = new Map();
  const f = fixture({ records });
  f.p.restoreSavedRun(f.g);
  f.g.time += 100;
  clearOrdinary(f);
  f.g.time += 100;
  f.g.respawn.dirty = true;
  assert.ok(f.p.persistRun(f.g));
  assert.ok(JSON.parse(records.get(RESPAWN_SAVE_KEY)).clock >= 200);
  const next = fixture({ records: new Map(records) });
  next.p.restoreSavedRun(next.g);
  next.g.time += 50;
  far(next.g);
  ticks(next.g);
  assert.deepEqual(keysOf(next.g), ["boss-veteran-v1"], "100 + 50 s since the kills");
  next.g.time += 40;
  ticks(next.g);
  assert.deepEqual(keysOf(next.g), ALL, "100 + 90 s since the kills");
});

test("old saves without a respawn record load as before and keep their kills permanent; bad records are ignored", () => {
  const records = new Map();
  const f = fixture({ records });
  f.p.restoreSavedRun(f.g);
  clearOrdinary(f);
  const bad = [
    undefined,
    "not json",
    "null",
    JSON.stringify({ version: "v2", clock: 5, kills: {} }),
    JSON.stringify({ version: "v1", clock: 5, kills: {}, extra: 1 }),
    JSON.stringify({ version: "v1", clock: -1, kills: {} }),
    JSON.stringify({ version: "v1", clock: 5, kills: { "area8-resident-1": 9 } }),
    JSON.stringify({ version: "v1", clock: 5, kills: { "Bad Key": 1 } }),
    JSON.stringify({ version: "v1", clock: 5, kills: [] }),
  ];
  for (const respawnRecord of bad) {
    const copy = new Map(records);
    if (respawnRecord === undefined) copy.delete(RESPAWN_SAVE_KEY);
    else copy.set(RESPAWN_SAVE_KEY, respawnRecord);
    const cold = fixture({ records: copy });
    cold.p.restoreSavedRun(cold.g);
    assert.equal(cold.g.runSaveInvalid, undefined, String(respawnRecord));
    assert.equal(cold.g.respawn, undefined, String(respawnRecord));
    cold.g.time += 10000;
    far(cold.g);
    ticks(cold.g);
    assert.deepEqual(keysOf(cold.g), ["boss-veteran-v1"], "permanent without a usable record: " + respawnRecord);
  }
  const g = { time: 3 };
  assert.equal(applyRespawnRecord(g, JSON.stringify({ version: "v1", clock: 50, kills: { "area8-resident-1": 10 } })), true);
  assert.deepEqual(g.respawn, { base: 47, kills: { "area8-resident-1": 10 }, dirty: false });
});

test("retry clears the stored record and a failing storage cannot break the run", () => {
  const records = new Map();
  const f = fixture({ records });
  f.p.restoreSavedRun(f.g);
  clearOrdinary(f);
  assert.ok(records.has(RESPAWN_SAVE_KEY));
  assert.ok(f.p.retry());
  assert.deepEqual(JSON.parse(records.get(RESPAWN_SAVE_KEY)), { version: "v1", clock: 0, kills: {} });
});
