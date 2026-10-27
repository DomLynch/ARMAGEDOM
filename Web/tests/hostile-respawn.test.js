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
const KEYS = { area8: ["area8-resident-1", "area8-resident-3", "area8-resident-4"] };

function fixture({ area = "area8", records = new Map(), content = rawContent() } = {}) {
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
    lineClear: () => true,
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

test("shipped data sets the respawn time at 300 s and keeps the tutorial out; a bad value fails", () => {
  const content = rawContent();
  assert.deepEqual(content.population.respawn, { seconds: 300, excludedAreas: ["westminster"] });
  assert.deepEqual(validateAreaMetadata(content, registry).populationData.respawn, content.population.respawn);
  const residents = validateAreaMetadata(content, registry).residents;
  for (const respawn of [
    { seconds: 5, excludedAreas: [] },
    { seconds: "300", excludedAreas: [] },
    { seconds: 300, excludedAreas: ["nowhere"] },
    { seconds: 300, excludedAreas: ["westminster", "westminster"] },
    { seconds: 300 },
    { seconds: 300, excludedAreas: [], extra: 1 },
  ])
    assert.throws(() => validatePopulationData({ ...content.population, respawn }, registry, residents, null), /population/);
  const { respawn, ...older } = content.population;
  assert.equal(validatePopulationData(older, registry, residents, null).respawn, undefined);
});

test("nobody appears while the player stays; the hostiles return on the next entry from elsewhere", async () => {
  const f = fixture();
  assert.deepEqual(keysOf(f.g), ["area8-resident-1", "area8-resident-3", "area8-resident-4", "boss-veteran-v1"]);
  clearOrdinary(f);
  assert.deepEqual(keysOf(f.g), ["boss-veteran-v1"]);
  const before = ledgers(f.g);
  // Present in the area: no amount of time brings anyone back.
  f.g.time += 5000;
  for (let i = 0; i < 5; i++) stepGame(f.g, {});
  assert.deepEqual(keysOf(f.g), ["boss-veteran-v1"]);
  await travelTo(f.g, { areaId: "lambeth" });
  assert.deepEqual(keysOf(f.g).includes("area8-resident-1"), false, "leaving does not revive the area they left");
  await travelTo(f.g, { areaId: "area8" });
  assert.deepEqual(keysOf(f.g), ["area8-resident-1", "area8-resident-3", "area8-resident-4", "boss-veteran-v1"]);
  assert.equal(ledgers(f.g), before);
});

test("no respawn before the delay, respawn after it, with the area line following the live count", async () => {
  const f = fixture();
  clearOrdinary(f);
  const boss = f.g.enemies.find((e) => e.bossProfile);
  assert.ok(boss);
  await travelTo(f.g, { areaId: "lambeth" });
  f.g.time += 120;
  await travelTo(f.g, { areaId: "area8" });
  assert.deepEqual(keysOf(f.g), ["boss-veteran-v1"], "too early");
  await travelTo(f.g, { areaId: "lambeth" });
  f.g.time += 200;
  const before = ledgers(f.g);
  await travelTo(f.g, { areaId: "area8" });
  assert.deepEqual(keysOf(f.g), ["area8-resident-1", "area8-resident-3", "area8-resident-4", "boss-veteran-v1"]);
  assert.equal(f.g.enemies.find((e) => e.bossProfile), boss, "the living boss is the same actor");
  assert.equal(f.g.encounterCleared, false);
  assert.equal(f.g.encounterActive, true);
  assert.ok(f.g.enemies.every((e) => e.hp > 0));
  assert.deepEqual(f.g.corpses.map((c) => c.placementKey).filter((k) => KEYS.area8.includes(k)), [], "old corpses of revived hostiles are gone");
  assert.equal(ledgers(f.g), before, "permanent ledgers untouched");
});

test("a respawned hostile pays no second reward, award or loot instance and dies cleanly again", async () => {
  const f = fixture();
  clearOrdinary(f);
  await travelTo(f.g, { areaId: "lambeth" });
  f.g.time += 400;
  await travelTo(f.g, { areaId: "area8" });
  const before = ledgers(f.g),
    kills = f.g.kills,
    first = f.g.enemies.find((e) => e.placementKey === "area8-resident-1");
  assert.ok(first);
  kill(f, first);
  assert.ok(!f.g.enemies.includes(first));
  assert.equal(ledgers(f.g), before, "no extra supply issue, award or drone death");
  assert.equal(f.g.pendingProgressionDeaths.length, 0);
  assert.equal(f.g.kills, kills + 1);
  // Its new kill time restarts the delay.
  await travelTo(f.g, { areaId: "lambeth" });
  f.g.time += 100;
  await travelTo(f.g, { areaId: "area8" });
  assert.ok(!keysOf(f.g).includes("area8-resident-1"));
  await travelTo(f.g, { areaId: "lambeth" });
  f.g.time += 250;
  await travelTo(f.g, { areaId: "area8" });
  assert.ok(keysOf(f.g).includes("area8-resident-1"));
});

test("bosses never respawn: their defeat, gate and unique rewards stay permanent", async () => {
  const f = fixture();
  const boss = f.g.enemies.find((e) => e.bossProfile);
  assert.equal(respawnable(f.g, boss), false);
  assert.equal(respawnable(f.g, { placementKey: "area8-resident-1", rig: "hollow-scavenger" }), true);
  assert.equal(respawnable(f.g, { placementKey: "east-roamer-2", rig: "hollow-scavenger" }), false, "the unique-reward holder");
  assert.equal(respawnable(f.g, { placementKey: "area8-resident-1", rig: "low-hover-drone" }), false, "drones");
  assert.equal(respawnable(f.g, { placementKey: "area8-resident-1", rig: "hollow-scavenger", markedHunter: true }), false);
});

test("a boss killed through the real kill path is never recorded, and stays dead after any delay", async () => {
  const f = fixture();
  clearOrdinary(f);
  const boss = f.g.enemies.find((e) => e.bossProfile);
  kill(f, boss);
  assert.deepEqual(keysOf(f.g), []);
  assert.equal(f.g.respawn.kills[boss.placementKey], undefined);
  assert.deepEqual(Object.keys(f.g.respawn.kills).sort(), KEYS.area8);
  await travelTo(f.g, { areaId: "lambeth" });
  f.g.time += 5000;
  await travelTo(f.g, { areaId: "area8" });
  assert.deepEqual(keysOf(f.g), KEYS.area8, "ordinary hostiles are back, the boss is not");
});

test("the Westminster tutorial area never respawns", async () => {
  const f = fixture({ area: "westminster" });
  const westminster = f.g.enemies.filter((e) => !e.bossProfile);
  assert.ok(westminster.length > 0);
  for (const e of westminster) assert.equal(respawnable(f.g, e), false);
  const before = keysOf(f.g);
  for (const enemy of westminster) kill(f, enemy);
  assert.equal(f.g.respawn, undefined, "nothing recorded");
  await travelTo(f.g, { areaId: "lambeth" });
  f.g.time += 5000;
  await travelTo(f.g, { areaId: "westminster" });
  assert.deepEqual(keysOf(f.g), before.filter((k) => !westminster.some((e) => e.placementKey === k)));
});

test("no policy means no respawn at all (older data and fixtures)", async () => {
  const content = rawContent();
  delete content.population.respawn;
  const f = fixture({ content });
  clearOrdinary(f);
  assert.equal(f.g.respawn, undefined);
  await travelTo(f.g, { areaId: "lambeth" });
  f.g.time += 5000;
  await travelTo(f.g, { areaId: "area8" });
  assert.deepEqual(keysOf(f.g), ["boss-veteran-v1"]);
});

test("kill times survive save and load: a cold start respawns after the delay, not before", async () => {
  const records = new Map();
  const f = fixture({ records });
  f.p.restoreSavedRun(f.g);
  clearOrdinary(f);
  await travelTo(f.g, { areaId: "lambeth" });
  assert.ok(f.p.persistRun(f.g));
  const stored = JSON.parse(records.get(RESPAWN_SAVE_KEY));
  assert.equal(stored.version, 1);
  assert.deepEqual(Object.keys(stored.kills).sort(), KEYS.area8);
  assert.ok(Object.keys(JSON.parse(records.get([...records.keys()].find((k) => k !== RESPAWN_SAVE_KEY)))).includes("version"), "the run record is written as before");
  // Early: a fresh session (play clock restarts at zero) a few seconds later.
  const early = fixture({ area: "lambeth", records: new Map(records) });
  early.p.restoreSavedRun(early.g);
  assert.deepEqual(early.g.respawn.kills, stored.kills);
  assert.equal(early.g.respawn.dirty, false);
  early.g.time += 60;
  await travelTo(early.g, { areaId: "area8" });
  assert.ok(!keysOf(early.g).includes("area8-resident-1"));
  // Late: more than the delay later.
  const late = fixture({ area: "lambeth", records: new Map(records) });
  late.p.restoreSavedRun(late.g);
  late.g.time += 400;
  await travelTo(late.g, { areaId: "area8" });
  assert.deepEqual(keysOf(late.g), ["area8-resident-1", "area8-resident-3", "area8-resident-4", "boss-veteran-v1"]);
  assert.equal(ledgers(late.g), ledgers(early.g), "the permanent ledgers restored identically");
});

test("play time carries across sessions: time already played counts towards the delay", async () => {
  const records = new Map();
  const f = fixture({ records });
  f.p.restoreSavedRun(f.g);
  f.g.time += 100;
  clearOrdinary(f);
  await travelTo(f.g, { areaId: "lambeth" });
  f.g.time += 250;
  await travelTo(f.g, { areaId: "area8" });
  await travelTo(f.g, { areaId: "lambeth" });
  assert.ok(f.p.persistRun(f.g));
  assert.ok(JSON.parse(records.get(RESPAWN_SAVE_KEY)).clock >= 350);
  const next = fixture({ area: "lambeth", records: new Map(records) });
  next.p.restoreSavedRun(next.g);
  next.g.time += 60;
  await travelTo(next.g, { areaId: "area8" });
  assert.ok(keysOf(next.g).includes("area8-resident-1"), "250 + 60 more seconds elapsed since the kills");
});

test("old saves without a respawn record load as before and keep their kills permanent; bad records are ignored", async () => {
  const records = new Map();
  const f = fixture({ records });
  f.p.restoreSavedRun(f.g);
  clearOrdinary(f);
  await travelTo(f.g, { areaId: "lambeth" });
  assert.ok(f.p.persistRun(f.g));
  const bad = [
    "not json",
    "null",
    JSON.stringify({ version: 2, clock: 5, kills: {} }),
    JSON.stringify({ version: 1, clock: 5, kills: {}, extra: 1 }),
    JSON.stringify({ version: 1, clock: -1, kills: {} }),
    JSON.stringify({ version: 1, clock: 5, kills: { "area8-resident-1": 9 } }),
    JSON.stringify({ version: 1, clock: 5, kills: { "Bad Key": 1 } }),
    JSON.stringify({ version: 1, clock: 5, kills: [] }),
  ];
  for (const respawnRecord of [undefined, ...bad]) {
    const copy = new Map(records);
    if (respawnRecord === undefined) copy.delete(RESPAWN_SAVE_KEY);
    else copy.set(RESPAWN_SAVE_KEY, respawnRecord);
    const cold = fixture({ area: "lambeth", records: copy });
    cold.p.restoreSavedRun(cold.g);
    assert.equal(cold.g.runSaveInvalid, undefined, String(respawnRecord));
    assert.equal(cold.g.respawn, undefined, String(respawnRecord));
    cold.g.time += 10000;
    await travelTo(cold.g, { areaId: "area8" });
    assert.deepEqual(keysOf(cold.g), ["boss-veteran-v1"], "permanent without a usable record: " + respawnRecord);
  }
  const g = { time: 3 };
  assert.equal(applyRespawnRecord(g, JSON.stringify({ version: 1, clock: 50, kills: { "area8-resident-1": 10 } })), true);
  assert.deepEqual(g.respawn, { base: 47, kills: { "area8-resident-1": 10 }, dirty: false });
});

test("a storage failure cannot break the run, and retry clears the record", async () => {
  const records = new Map();
  const f = fixture({ records });
  f.p.restoreSavedRun(f.g);
  clearOrdinary(f);
  assert.ok(records.has(RESPAWN_SAVE_KEY));
  assert.ok(f.p.retry());
  assert.deepEqual(JSON.parse(records.get(RESPAWN_SAVE_KEY)), { version: 1, clock: 0, kills: {} });
});
