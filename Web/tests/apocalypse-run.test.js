import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateApocalypseRun } from "../src/engine/game-data-run.js";
import {
  runEnabled,
  canStartRun,
  startRun,
  stepApocalypseRun,
  runHeatScale,
  runSession,
  runTimerLine,
  runObjective,
  runBanner,
  runResults,
  dismissRun,
  runTotalSeconds,
  clock,
} from "../src/engine/apocalypse-run.js";
import { stepHeat, addHeat } from "../src/engine/heat.js";
import { stepMarkedHunters, clearMarkedHunters } from "../src/engine/marked-hunters.js";
import { armPostBossRaid } from "../src/engine/post-boss-raid.js";
import { make, shipped } from "./helpers/marked-fixture.js";
import { LondonWorld } from "../src/world.js";

const RUN = GAME_DATA.apocalypseRun,
  CAP = GAME_DATA.postBossRaid.maxSimultaneous,
  [S1, S2, S3] = RUN.stages,
  raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/apocalypseRun.json", import.meta.url)))),
  hub = { areaId: RUN.startZone, safehouseData: { areaId: RUN.startZone, wholeArea: true, boundary: [] }, geometry: { ground: (p) => p } },
  road = { areaId: "east-bridge", geometry: { clear: () => true, ground: (p) => p }, lineClear: () => true },
  fake = (extra = {}) => ({
    time: 0,
    kills: 0,
    enemies: [],
    events: [],
    world: road,
    player: { hp: 100, radius: 0.4, pos: { x: 0, z: 0 } },
    ...extra,
  }),
  started = (extra = {}) => {
    const g = fake(extra);
    g.world = hub;
    assert.ok(startRun(g));
    g.world = road;
    return g;
  },
  at = (g, seconds) => {
    g.time = g.run.startAt + seconds;
    stepApocalypseRun(g);
  };

test("the run row validates and refuses broken rows; the shipped run is twelve minutes of three stages", () => {
  assert.doesNotThrow(() => validateApocalypseRun(raw()));
  for (const mutate of [
    (d) => { d.extra = 1; },
    (d) => { d.offSwitch.param = d.startSwitch.param; },
    (d) => { d.stages[1].raids = [{ atSeconds: 50 }, { atSeconds: 20 }]; },
    (d) => { d.stages[1].raids = [{ atSeconds: d.stages[1].seconds }]; },
    (d) => { d.stages.at(-1).objectiveFrom = "assault"; },
    (d) => { d.raidZones.push("westminster"); },
    (d) => { d.variants.finale = [{ id: "boss", kind: "boss", objective: "Kill it." }]; },
    (d) => { d.variants.assault[0].hunterCount = 0; },
    (d) => { d.variants.hazard = []; },
    (d) => { d.outcomes.extra = "x"; },
  ]) {
    const d = raw();
    mutate(d);
    assert.throws(() => validateApocalypseRun(d));
  }
  assert.deepEqual(RUN.stages.map((s) => s.id), ["scavenge", "invasion", "finale"]);
  assert.equal(runTotalSeconds(), 720);
  assert.deepEqual(RUN.offSwitch, { param: "norun", value: "1" });
  assert.deepEqual(RUN.startSwitch, { param: "run", value: "1" });
  assert.ok(S1.heatScale < 1 && S2.heatScale > 1, "scavenge is quiet and the invasion is hot");
  assert.equal(S1.raids.length, 0, "no raid in the scavenge stage");
  assert.ok(S2.raids.length >= 1);
});

test("stages follow the game clock: banner, timer, objective and heat scale change with the stage", () => {
  const g = started();
  at(g, 0);
  assert.equal(g.run.stage, 0);
  assert.equal(runBanner(g).title, S1.banner);
  assert.equal(runTimerLine(g).startsWith(`${S1.banner} · 4:00`), true);
  assert.equal(runObjective(g), g.run.picks.scavenge.objective);
  assert.equal(runHeatScale(g), S1.heatScale * g.run.picks.hazard.heatScale);
  at(g, RUN.bannerSeconds + 1);
  assert.equal(runBanner(g), null, "the banner goes after its few seconds");
  at(g, S1.seconds - 1);
  assert.equal(g.run.stage, 0);
  at(g, S1.seconds);
  assert.equal(g.run.stage, 1);
  assert.equal(runBanner(g).title, S2.banner);
  assert.equal(runObjective(g), g.run.picks.assault.objective);
  assert.equal(runHeatScale(g), S2.heatScale * g.run.picks.hazard.heatScale);
  at(g, S1.seconds + S2.seconds);
  assert.equal(g.run.stage, 2);
  assert.equal(runBanner(g).title, S3.banner);
  assert.equal(runTimerLine(g).startsWith(`${S3.banner} · 4:00`), true);
  assert.equal(clock(59.2), "1:00");
  assert.equal(clock(61), "1:01");
});

test("the invasion fires the raid on its timers, one at a time, with the post-boss raid's own cap", () => {
  const g = started();
  at(g, S1.seconds - 1);
  assert.equal(g.raid ?? null, null, "nothing in the scavenge stage");
  at(g, S1.seconds + S2.raids[0].atSeconds);
  const assault = g.run.picks.assault;
  assert.ok(g.raid, "the first trigger armed a raid");
  assert.equal(g.raid.row.hunterCount, assault.hunterCount);
  assert.equal(g.raid.row.maxSimultaneous, GAME_DATA.postBossRaid.maxSimultaneous, "the run never raises the cap");
  assert.equal(g.raid.row.delaySeconds, 0);
  assert.deepEqual(g.raid.row.targetZones, RUN.raidZones);
  assert.equal(g.run.fired.length, 1);
  const first = g.raid;
  at(g, S1.seconds + S2.raids[0].atSeconds + 5);
  assert.equal(g.raid, first, "a raid in progress is never doubled");
  g.raid = null;
  at(g, S1.seconds + S2.raids[1].atSeconds);
  assert.equal(g.run.fired.length, 2);
  assert.ok(g.raid && g.raid !== first, "the second trigger armed a fresh raid");
  at(g, S1.seconds + S2.raids[1].atSeconds + 1);
  assert.equal(g.run.fired.length, 2, "a trigger fires once");
});

// The real hunt on the shipped data with the run's raid and top heat: normal hunters plus raiders never pass the cap.
test("raid cap: with the run's raid armed and heat at its top, normal hunters plus raiders stay inside the cap", () => {
  const f = make({ data: shipped }),
    g = f.g;
  let serial = 100,
    worst = 0,
    raiders = 0;
  // The fixture's real world is Westminster, whose hunt the other hunt tests run on: the run's rules name it as start and raid zone.
  const rules = { ...RUN, startZone: g.world.areaId, raidZones: [g.world.areaId] };
  g.world.travelAt = LondonWorld.prototype.travelAt.bind(g.world);
  g.time = 0;
  assert.ok(startRun(g, rules));
  g.enemies = [];
  g.marked = { version: 1, carried: 0, bank: 0, bounty: 0 };
  clearMarkedHunters(g);
  g.heat = { count: GAME_DATA.heat.maxHeat, lastKillAt: 0, seen: g.kills ?? 0, rolls: 0 };
  g.run.startAt = -S1.seconds; // the invasion is on
  const spawn = (p) => ({ id: ++serial, hp: 80, markedHunter: true, pos: { ...p }, radius: 0.4, hostile: true });
  for (let t = 0; t < 400; t += 0.5) {
    g.time = t;
    g.heat.lastKillAt = t;
    stepApocalypseRun(g, rules);
    stepMarkedHunters(g, spawn);
    g.enemies.forEach((e, i) => { if (e.markedHunter && !e.moved) { e.moved = true; e.pos = { x: 500 + e.id, z: 500 + i }; } });
    const marked = g.enemies.filter((e) => e.markedHunter && e.hp > 0);
    worst = Math.max(worst, marked.length);
    raiders = Math.max(raiders, marked.filter((e) => e.raidHunter).length);
  }
  assert.ok(raiders > 0, "the run's raid really sent raiders");
  assert.ok(worst <= CAP, `normal hunters plus raiders (${worst}) stay inside the cap (${CAP})`);
});

test("end conditions: died, boss killed, escaped and time out each end the run once, and stop the raid", () => {
  const died = started();
  at(died, 5);
  died.player.hp = 0;
  at(died, 6);
  assert.equal(died.run.outcome, "died");
  const boss = started();
  at(boss, 1);
  boss.run.boss = { hp: 40, runBoss: true };
  at(boss, 2);
  assert.equal(boss.run.outcome, null);
  boss.run.boss.hp = 0;
  boss.raid = { row: {} };
  at(boss, 3);
  assert.equal(boss.run.outcome, "boss");
  assert.equal(boss.raid, null, "the run's raid ends with the run");
  const late = started();
  at(late, runTotalSeconds() + 1);
  assert.equal(late.run.outcome, "timeout");
  const first = late.run.result;
  at(late, runTotalSeconds() + 50);
  assert.equal(late.run.result, first, "an ended run does not end again");
});

test("finale: a boss row summons the area's living boss beside the player; with none, it is the escape", () => {
  const g = started(),
    bossRow = RUN.variants.finale.find((r) => r.kind === "boss"),
    escapeRow = RUN.variants.finale.find((r) => r.kind === "escape");
  g.run.picks.finale = bossRow;
  const boss = { id: 7, hp: 60, radius: 0.5, bossProfile: { name: "Test" }, pos: { x: 90, z: 90 }, home: { x: 90, z: 90 }, alerted: false };
  g.enemies = [boss];
  at(g, S1.seconds + S2.seconds);
  assert.equal(g.run.finale.kind, "boss");
  assert.equal(g.run.boss, boss);
  assert.equal(boss.runBoss, true);
  assert.equal(boss.alerted, true);
  assert.ok(Math.abs(Math.hypot(boss.pos.x, boss.pos.z) - RUN.boss.spawnDistance) < 1e-9, "the boss stands at the data's distance");
  assert.equal(runObjective(g), bossRow.objective);
  at(g, S1.seconds + S2.seconds + 1);
  boss.hp = 0;
  at(g, S1.seconds + S2.seconds + 2);
  assert.equal(g.run.outcome, "boss");
  const none = started();
  none.run.picks.finale = bossRow;
  none.enemies = [];
  at(none, S1.seconds + S2.seconds);
  assert.equal(none.run.finale.kind, "escape");
  assert.equal(none.run.finale.fallback, true);
  assert.equal(runObjective(none), escapeRow.objective);
});

test("finale escape: the safehouse ends the run only after the player has been out of it", () => {
  const g = started();
  g.run.picks.finale = RUN.variants.finale.find((r) => r.kind === "escape");
  g.world = hub; // the player stands in the hub safehouse as the finale begins
  at(g, S1.seconds + S2.seconds);
  assert.equal(g.run.finale.kind, "escape");
  at(g, S1.seconds + S2.seconds + 5);
  assert.equal(g.run.outcome, null, "starting inside the safehouse is not an escape");
  g.world = road;
  at(g, S1.seconds + S2.seconds + 10);
  assert.equal(g.run.armed, true);
  assert.equal(g.run.outcome, null);
  g.world = hub;
  at(g, S1.seconds + S2.seconds + 20);
  assert.equal(g.run.outcome, "escaped");
});

test("results: kills, time, heat peak and outcome; Continue clears the card and lets a new run start", () => {
  const before = runSession.count,
    g = started();
  g.heat = { count: 4, lastKillAt: 0, seen: 0, rolls: 0 };
  at(g, 30);
  g.kills = 9;
  g.heat.count = 7;
  at(g, 90);
  g.heat.count = 2;
  at(g, 100);
  g.player.hp = 0;
  at(g, 101);
  assert.deepEqual(g.run.result, { outcome: "died", kills: 9, seconds: 101, heatPeak: 7 });
  const rows = runResults(g);
  assert.deepEqual(rows.map((r) => r.value), [RUN.outcomes.died, "9", "1:41", "7"]);
  assert.deepEqual(rows.map((r) => r.label), [RUN.text.rowOutcome, RUN.text.rowKills, RUN.text.rowTime, RUN.text.rowHeat]);
  assert.equal(runTimerLine(g), "", "no stage timer once the run is over");
  assert.equal(runObjective(g), "");
  assert.equal(runHeatScale(g), 1);
  g.world = hub;
  g.player.hp = 100;
  assert.equal(canStartRun(g), false, "the results must be read first");
  dismissRun(g);
  assert.equal(runResults(g), null);
  g.finished = false;
  assert.equal(canStartRun(g), true);
  assert.ok(startRun(g));
  assert.equal(runSession.count, before + 1);
  assert.equal(g.run.outcome, null);
});

test("off switch ?norun=1 turns the mode off whole; the default is the sandbox and ?run=1 starts once in the hub", () => {
  runSession.autoDone = false;
  assert.equal(runEnabled(RUN, "?norun=1"), false);
  assert.equal(runEnabled(RUN, "?run=1"), true);
  assert.equal(runEnabled(RUN, ""), true);
  assert.equal(runEnabled({ ...RUN, enabled: false }, ""), false);
  const off = fake();
  off.world = hub;
  assert.equal(startRun(off, RUN, "?norun=1"), false);
  off.run = { stage: 0 };
  stepApocalypseRun(off, RUN, "?norun=1");
  assert.equal(off.run, null);
  const sandbox = fake();
  sandbox.world = hub;
  stepApocalypseRun(sandbox, RUN, "");
  assert.equal(sandbox.run ?? null, null, "no run starts on its own");
  stepApocalypseRun(sandbox, RUN, "?norun=1&run=1");
  assert.equal(sandbox.run ?? null, null, "off beats start");
  const road1 = fake();
  stepApocalypseRun(road1, RUN, "?run=1");
  assert.equal(road1.run ?? null, null, "?run=1 waits for the start zone");
  const auto = fake();
  auto.world = hub;
  stepApocalypseRun(auto, RUN, "?run=1");
  assert.ok(auto.run, "?run=1 starts the run in the hub");
  const seed = auto.run.seed;
  auto.run = null;
  stepApocalypseRun(auto, RUN, "?run=1");
  assert.equal(auto.run, null, "and only once per game");
  assert.equal(typeof seed, "string");
});

test("the seed picks the rows: the same seed repeats, the run count changes them across runs", () => {
  const one = (count) => {
    const g = fake();
    g.world = hub;
    startRun(g, RUN, undefined, count);
    return g.run;
  };
  assert.deepEqual(one(1).picks, one(1).picks);
  assert.equal(one(1).seed, one(1).seed);
  const kinds = new Set();
  for (let n = 1; n <= 40; n++) kinds.add(["scavenge", "assault", "hazard", "finale"].map((k) => one(n).picks[k].id).join("/"));
  assert.ok(kinds.size > 6, `runs differ in objective, assault, hazard and finale (${kinds.size} combinations in 40 runs)`);
  for (const [kind, rows] of Object.entries(RUN.variants)) {
    const seen = new Set();
    for (let n = 1; n <= 60; n++) seen.add(one(n).picks[kind].id);
    assert.equal(seen.size, rows.length, `every ${kind} row can come up`);
  }
});

test("heat gain follows the stage: half in the scavenge stage, double in the invasion, the fraction carries", () => {
  const g = started();
  stepHeat(g);
  at(g, 1);
  g.run.picks.hazard = { id: "x", label: "x", heatScale: 1 };
  g.kills = 4;
  stepHeat(g);
  assert.equal(g.heat.count, 4 * S1.heatScale, "scavenge: half the kills");
  at(g, S1.seconds + 1);
  g.kills += 3;
  stepHeat(g);
  assert.equal(g.heat.count, 4 * S1.heatScale + 3 * S2.heatScale);
  const odd = started();
  at(odd, 1);
  odd.run.picks.hazard = { id: "x", label: "x", heatScale: 1 };
  stepHeat(odd);
  odd.kills = 1;
  stepHeat(odd);
  assert.equal(odd.heat.count, 0, "half a mark is not a mark yet");
  odd.kills = 2;
  stepHeat(odd);
  assert.equal(odd.heat.count, 1, "two halves make one");
  const plain = fake({ kills: 0 });
  stepHeat(plain);
  plain.kills = 3;
  stepHeat(plain);
  assert.equal(plain.heat.count, 3, "outside a run heat is exactly +1 per kill");
});

test("a run is session-only: a persisted run carries no run state", () => {
  const f = make({ data: shipped }),
    g = f.g;
  g.world.areaId = RUN.startZone;
  assert.ok(startRun(g));
  g.world.areaId = "westminster";
  g.run.heatPeak = 3;
  assert.ok(f.p.persistRun(g));
  assert.ok(f.writes.length > 0);
  for (const w of f.writes) {
    assert.ok(!/"run"\s*:/.test(w.raw), "no run key in the saved run");
    assert.ok(!/apocalypse|heatPeak|picks/.test(w.raw), "no run fields in the saved run");
  }
});

test("a boss kill during a run still arms the post-boss raid, and the run ends it with the boss", () => {
  const g = started();
  g.run.picks.finale = RUN.variants.finale.find((r) => r.kind === "boss");
  g.enemies = [{ id: 3, hp: 50, radius: 0.5, bossProfile: { name: "T" }, pos: { x: 50, z: 50 }, home: { x: 50, z: 50 } }];
  at(g, S1.seconds + S2.seconds);
  g.run.boss.hp = 0;
  g.events = [{ type: "boss-defeated", actor: g.run.boss }];
  armPostBossRaid(g);
  assert.ok(g.raid);
  at(g, S1.seconds + S2.seconds + 1);
  assert.equal(g.run.outcome, "boss");
  assert.equal(g.raid, null);
});

test("Retry: a new game object gets a fresh seed and ?run=1 does not start a second run", () => {
  const first = fake();
  first.world = hub;
  assert.ok(startRun(first));
  const seed = first.run.seed;
  const retried = fake(); // Retry builds a new game; the count and the auto-start live with the page
  retried.world = hub;
  assert.ok(startRun(retried));
  assert.notEqual(retried.run.seed, seed);
  runSession.autoDone = true;
  const auto = fake();
  auto.world = hub;
  stepApocalypseRun(auto, RUN, "?run=1");
  assert.equal(auto.run ?? null, null);
});

test("the summoned boss gets its own home back when the run ends", () => {
  const g = started(),
    home = { x: 90, z: 90 },
    boss = { id: 7, hp: 60, radius: 0.5, bossProfile: { name: "T" }, pos: { ...home }, home, alerted: false };
  g.run.picks.finale = RUN.variants.finale.find((r) => r.kind === "boss");
  g.enemies = [boss];
  at(g, S1.seconds + S2.seconds);
  assert.notEqual(boss.home, home);
  g.player.hp = 0;
  at(g, S1.seconds + S2.seconds + 1);
  assert.equal(boss.home, home);
});

test("the stage scale rides addHeat: kills, and stash, crate and boss gains when scaleValuables is on", () => {
  const g = started();
  stepHeat(g);
  at(g, 1);
  g.run.picks.hazard = { id: "x", label: "x", heatScale: 1 };
  assert.equal(RUN.scaleValuables, true);
  addHeat(g, 4); // a kill gain, half rate in the scavenge stage
  assert.equal(g.heat.count, 4 * S1.heatScale);
  g.heat.count = 0;
  addHeat(g, 4, undefined, undefined, true); // a valuable
  assert.equal(g.heat.count, 4 * S1.heatScale);
  assert.equal(runHeatScale(g, { ...RUN, scaleValuables: false }, true), 1, "off: valuables keep full size");
  assert.equal(runHeatScale(g, { ...RUN, scaleValuables: false }, false), S1.heatScale, "kills are always scaled");
});
