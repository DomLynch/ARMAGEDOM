import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validatePostBossRaid } from "../src/engine/game-data-raid.js";
import { armPostBossRaid, stepPostBossRaid } from "../src/engine/post-boss-raid.js";
import { publicAreaRegistry } from "../src/area-registry.js";

const ROW = GAME_DATA.postBossRaid,
  raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/postBossRaid.json", import.meta.url)))),
  ZONE = ROW.targetZones[0];

const game = (areaId = ZONE) => ({
  time: 0,
  events: [],
  enemies: [],
  player: { hp: 100, pos: { x: 0, z: 0 } },
  world: { areaId, markedData: { hunterHealth: 80 } },
});
const spawn = (p) => ({ hp: 80, markedHunter: true, pos: { ...p } });
const entry = () => ({ x: 5, z: 5 });
const kill = (g, id = "boss-defeated") => g.events.push({ type: id, placementKey: "boss-a" });
const step = (g, open = true) => stepPostBossRaid(g, spawn, entry, open);
const raiders = (g) => g.enemies.filter((e) => e.raidHunter && e.hp > 0);

test("the raid row validates, refuses broken rows, and keeps the tutorial and the cap safe", () => {
  assert.doesNotThrow(() => validatePostBossRaid(raw()));
  for (const mutate of [
    (d) => { d.maxSimultaneous = d.hunterCount + 1; },
    (d) => { d.targetZones = []; },
    (d) => { d.targetZones.push(d.trigger.ignoreAreas[0]); },
    (d) => { d.durationSeconds = 1; },
    (d) => { d.extra = 1; },
    (d) => { d.messageSeconds = 0; },
  ]) {
    const d = raw();
    mutate(d);
    assert.throws(() => validatePostBossRaid(d));
  }
  for (const id of ROW.targetZones) assert.ok(publicAreaRegistry.has(id), id);
  assert.ok(!ROW.targetZones.includes("westminster"));
  assert.ok(ROW.maxSimultaneous <= ROW.hunterCount);
});

test("trigger: a boss kill arms the raid with the data message; other events and ignored areas do not", () => {
  const g = game();
  kill(g, "death");
  armPostBossRaid(g);
  assert.equal(g.raid, undefined);
  const tutorial = game(ROW.trigger.ignoreAreas[0]);
  kill(tutorial);
  armPostBossRaid(tutorial);
  assert.equal(tutorial.raid, undefined);
  kill(g);
  armPostBossRaid(g);
  assert.equal(g.raid.startAt, ROW.delaySeconds);
  assert.equal(g.message, GAME_DATA.webText.texts["raid.armed"]);
  step(g);
  assert.equal(raiders(g).length, 0, "nobody comes before the delay");
});

test("one-shot per kill: reading the same event again, or a second kill during a raid, arms nothing new", () => {
  const g = game();
  kill(g);
  armPostBossRaid(g);
  const first = g.raid;
  armPostBossRaid(g);
  g.time = 5;
  kill(g);
  armPostBossRaid(g);
  assert.equal(g.raid, first);
  assert.equal(first.startAt, ROW.delaySeconds);
  g.raid = null;
  armPostBossRaid(g); // the old events are already spent
  assert.equal(g.raid, null);
  kill(g);
  armPostBossRaid(g);
  assert.ok(g.raid, "a later kill is a new raid");
});

test("cap: never more than maxSimultaneous raiders at once, never more than hunterCount in total, then the raid ends", () => {
  const g = game();
  kill(g);
  armPostBossRaid(g);
  let total = 0,
    peak = 0;
  for (let t = 0; t < ROW.durationSeconds && g.raid; t += 0.5) {
    g.time = t;
    const before = raiders(g).length;
    step(g);
    peak = Math.max(peak, raiders(g).length);
    total += Math.max(0, raiders(g).length - before);
    // The player kills the front raider every few seconds once they are here.
    if (t >= ROW.delaySeconds + 4 && raiders(g)[0] && Math.round(t) % 4 === 0) raiders(g)[0].hp = 0;
    g.enemies = g.enemies.filter((e) => e.hp > 0);
  }
  assert.equal(peak, ROW.maxSimultaneous);
  assert.equal(total, ROW.hunterCount);
  assert.equal(g.raid, null);
});

test("zone and gates: nothing spawns outside the target zones, behind a safehouse, or after death; travel refunds the cleared raiders", () => {
  const g = game("south");
  kill(g);
  armPostBossRaid(g);
  g.time = ROW.delaySeconds + 1;
  step(g);
  assert.equal(raiders(g).length, 0);
  g.world.areaId = ZONE;
  step(g, false);
  assert.equal(raiders(g).length, 0);
  step(g);
  assert.equal(raiders(g).length, ROW.maxSimultaneous);
  g.enemies = []; // the player leaves: the Marked hunt clears every hunter of the old area
  g.world.areaId = "south";
  step(g);
  assert.equal(g.raid.spawned, 0);
  g.player.hp = 0;
  step(g);
  assert.equal(g.raid, null);
});

test("the window closes on time", () => {
  const g = game();
  kill(g);
  armPostBossRaid(g);
  g.time = ROW.durationSeconds + 1;
  step(g);
  assert.equal(g.raid, null);
  assert.equal(raiders(g).length, 0);
});
