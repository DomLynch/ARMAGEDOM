import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateHeat } from "../src/engine/game-data-heat.js";
import { heatEnabled, stepHeat, resetHeat, heatTier, heatSeconds, heatHunterLimit, heatStarHunter, heatShown } from "../src/engine/heat.js";
import { groupSlots, seeded } from "../src/engine/heat-tally-strokes.js";
import { stepMarkedHunters, clearMarkedHunters } from "../src/engine/marked-hunters.js";
import { make, shipped } from "./helpers/marked-fixture.js";
import { LondonWorld } from "../src/world.js";
import { Vector3 } from "three";
import { createHeatTallyView } from "../src/engine/heat-tally-view.js";

const HEAT = GAME_DATA.heat,
  CAP = GAME_DATA.postBossRaid.maxSimultaneous,
  DECAY = HEAT.decay.secondsPerMark,
  raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/heat.json", import.meta.url)))),
  fake = (extra = {}) => ({ time: 0, kills: 0, enemies: [], world: { areaId: "east-bridge" }, ...extra });

test("the heat row validates, refuses broken rows, and its thresholds and decay are the agreed values", () => {
  assert.doesNotThrow(() => validateHeat(raw()));
  for (const mutate of [
    (d) => { d.decay.fadeSeconds = d.decay.secondsPerMark + 1; },
    (d) => { d.pressure.tiers[1].minHeat = d.pressure.tiers[0].minHeat; },
    (d) => { d.pressure.tiers[0].timeScale = 0; },
    (d) => { d.pressure.tiers[2].stars.push({ stars: 1, chance: 0.9 }); },
    (d) => { d.extra = 1; },
    (d) => { d.offSwitch.param = "No Heat"; },
  ]) {
    const d = raw();
    mutate(d);
    assert.throws(() => validateHeat(d));
  }
  assert.deepEqual(HEAT.pressure.tiers.map((t) => t.minHeat), [1, 3, 5]);
  assert.equal(DECAY, 90);
  assert.equal(HEAT.groupSize, 5);
  assert.deepEqual(HEAT.offSwitch, { param: "noheat", value: "1" });
});

test("heat goes up by one for every kill, and kills made before the session never count", () => {
  const g = fake({ kills: 40 });
  stepHeat(g);
  assert.equal(g.heat.count, 0);
  g.kills = 41;
  g.time = 1;
  stepHeat(g);
  assert.equal(g.heat.count, 1);
  g.kills = 44;
  g.time = 2;
  stepHeat(g);
  assert.equal(g.heat.count, 4);
  stepHeat(g);
  assert.equal(g.heat.count, 4, "reading the same kills again adds nothing");
});

test("groups of five: four marks then a strike, and a second group after five", () => {
  const slots = (n) => groupSlots(HEAT.look, HEAT.groupSize, n, (i) => seeded(i + 1));
  assert.deepEqual(slots(4).map((s) => s.kind), ["mark", "mark", "mark", "mark"]);
  assert.deepEqual(slots(5).map((s) => s.kind), ["mark", "mark", "mark", "mark", "strike"]);
  assert.equal(slots(2).length, 2);
  assert.equal(slots(9).length, HEAT.groupSize, "one group never draws more than its five");
  for (const s of slots(5).slice(0, 4)) assert.equal(s.gouges.length, 1 + HEAT.look.companions.offsetsPx.length);
});

test("fade: a mark drops after secondsPerMark without a kill, the newest dims first, and a kill restarts the clock", () => {
  const g = fake();
  g.kills = 3;
  stepHeat(g);
  g.kills = 3;
  g.heat.count = 3;
  g.heat.lastKillAt = 0;
  g.time = DECAY - HEAT.decay.fadeSeconds - 1;
  assert.deepEqual(heatShown(g), { count: 3, lastAlpha: 1 });
  g.time = DECAY - 1;
  const dim = heatShown(g).lastAlpha;
  assert.ok(dim < 1 && dim >= HEAT.decay.minAlpha, "the newest mark is dim just before it drops");
  g.time = DECAY;
  stepHeat(g);
  assert.equal(g.heat.count, 2);
  assert.equal(heatShown(g).lastAlpha, 1, "the next mark starts fresh");
  g.time = DECAY * 2 + 5;
  stepHeat(g);
  assert.equal(g.heat.count, 1);
  g.kills = 4;
  stepHeat(g);
  assert.equal(g.heat.count, 2);
  assert.equal(g.heat.lastKillAt, g.time, "a kill restarts the countdown");
  g.time += DECAY * 5;
  stepHeat(g);
  assert.equal(g.heat.count, 0);
  assert.equal(heatShown(g), null);
});

test("death resets heat to zero, through the real hunt step", () => {
  const g = make({ data: shipped }).g;
  g.enemies = [];
  g.time = 10;
  stepMarkedHunters(g, () => ({}));
  g.kills += 6;
  g.time = 11;
  stepMarkedHunters(g, () => ({}));
  assert.equal(g.heat.count, 6);
  g.player.hp = 0;
  stepMarkedHunters(g, () => ({}));
  assert.equal(g.heat.count, 0);
  assert.equal(heatShown(g), null);
  g.kills += 1;
  g.player.hp = 100;
  g.time = 12;
  stepMarkedHunters(g, () => ({}));
  assert.equal(g.heat.count, 1, "heat starts again from the next kill");
});

test("off switch: ?noheat=1 turns heat, its tiers and the tally off", () => {
  assert.equal(heatEnabled(HEAT, "?noheat=1"), false);
  assert.equal(heatEnabled(HEAT, "?x=1"), true);
  assert.equal(heatEnabled(HEAT, ""), true);
  const g = fake({ kills: 5 });
  stepHeat(g, HEAT, "?noheat=1");
  assert.equal(g.heat, null);
  assert.equal(heatTier(g), null);
  assert.equal(heatShown(g), null);
  assert.equal(heatSeconds(g, 60), 60);
  assert.equal(heatEnabled({ ...HEAT, enabled: false }, ""), false);
});

test("tiers: 1-2, 3-4 and 5+ pick their rows; waits shrink to the floor and extra hunters stay inside the raid cap", () => {
  const at = (n) => fake({ heat: { count: n, lastKillAt: 0, seen: 0, rolls: 0 } }),
    index = (n) => HEAT.pressure.tiers.indexOf(heatTier(at(n)));
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(index), [-1, 0, 0, 1, 1, 2, 2]);
  assert.equal(heatSeconds(at(0), 60), 60);
  assert.equal(heatSeconds(at(1), 60), 60 * HEAT.pressure.tiers[0].timeScale);
  assert.equal(heatSeconds(at(5), 60), Math.max(HEAT.pressure.minSeconds, 60 * HEAT.pressure.tiers[2].timeScale));
  assert.equal(heatSeconds(at(5), 6), 6, "a wait already under the floor is never raised");
  assert.equal(heatHunterLimit(at(2), 1), 1);
  assert.equal(heatHunterLimit(at(3), 1), Math.min(2, CAP));
  const raided = at(9);
  raided.enemies.push({ raidHunter: true, hp: 80 });
  assert.equal(heatHunterLimit(raided, 1), Math.max(1, CAP - 1), "a living raider takes its place under the cap");
  for (const n of [0, 3, 9]) assert.ok(heatHunterLimit(at(n), 1) <= Math.max(1, CAP));
});

// The ordinary hunt on the shipped data and the real fixture, heat held at `count`, optionally with a post-boss raider alive.
function hunt(count, { raider = false } = {}) {
  const g = make({ data: shipped }).g;
  let serial = 100,
    firstAt = null,
    peak = 0,
    worst = 0;
  g.enemies = [];
  g.world.travelAt = LondonWorld.prototype.travelAt.bind(g.world);
  g.marked = { version: 1, carried: 0, bank: 0, bounty: 0 };
  clearMarkedHunters(g);
  g.time = 0;
  g.heat = count ? { count, lastKillAt: 0, seen: g.kills ?? 0, rolls: 0 } : null;
  g.raid = raider ? { startAt: 0, endAt: 1e9, spawned: 1, live: 1, nextAt: 1e9, areaId: g.world.areaId } : null;
  if (raider) g.enemies.push({ id: 98, hp: 80, markedHunter: true, raidHunter: true, pos: { x: 900, z: 900 }, radius: 0.4, hostile: true });
  const spawn = (p) => ({ id: ++serial, hp: 80, markedHunter: true, pos: { ...p }, radius: 0.4, hostile: true });
  for (let t = 0; t < 400; t += 0.5) {
    g.time = t;
    if (g.heat) g.heat.lastKillAt = t; // the player keeps killing, so the heat holds
    stepMarkedHunters(g, spawn);
    const normal = g.enemies.filter((e) => e.markedHunter && !e.raidHunter && e.hp > 0);
    normal.forEach((e, i) => { if (!e.moved) { e.moved = true; e.pos = { x: 500 + e.id, z: 500 + i }; } });
    if (normal.length && firstAt === null) firstAt = t;
    peak = Math.max(peak, normal.length);
    worst = Math.max(worst, g.enemies.filter((e) => e.markedHunter && e.hp > 0).length);
  }
  return { firstAt, peak, worst };
}

test("heat tiers change the real hunt's timing and count, and the total never passes the raid cap", () => {
  const none = hunt(0),
    one = hunt(1),
    three = hunt(3),
    five = hunt(5);
  assert.ok(one.firstAt < none.firstAt, "tier 1 brings the first hunter sooner");
  assert.ok(three.firstAt < one.firstAt, "tier 2 sooner again");
  assert.ok(five.firstAt <= three.firstAt);
  assert.equal(none.peak, 1);
  assert.equal(one.peak, 1);
  assert.equal(three.peak, Math.min(1 + HEAT.pressure.tiers[1].extraHunters, CAP));
  assert.equal(five.peak, Math.min(1 + HEAT.pressure.tiers[2].extraHunters, CAP));
  for (const r of [none, one, three, five]) assert.ok(r.worst <= CAP);
  const raided = hunt(9, { raider: true });
  assert.ok(raided.worst <= CAP, "with a raider alive the total stays inside the cap");
  assert.ok(raided.peak <= CAP - 1);
});

test("star hunters: only at the top tier, from the star rows, never touching health, off with the stars switch", () => {
  const row = (n) => GAME_DATA.starVariants.stars.find((r) => r.stars === n),
    top = (t) => ({ ...t, stars: t.stars.length ? [{ stars: 2, chance: 1 }] : [] }),
    sure = { ...HEAT, pressure: { ...HEAT.pressure, tiers: HEAT.pressure.tiers.map(top) } },
    heated = (n, areaId = "east-bridge") => fake({ world: { areaId }, heat: { count: n, lastKillAt: 0, seen: 0, rolls: 0 } }),
    hunter = () => ({ hp: 80, maxHP: 80, mobSize: 1, radius: 0.4, combatScale: 1 });
  const star = heatStarHunter(heated(5), hunter(), sure);
  assert.equal(star.star, row(2));
  assert.equal(star.hp, 80);
  assert.equal(star.maxHP, 80);
  assert.equal(star.mobSize, row(2).scale);
  assert.equal(heatStarHunter(heated(4), hunter(), sure).star, undefined, "tier 2 never stars");
  assert.equal(heatStarHunter(heated(0), hunter(), sure).star, undefined);
  assert.equal(heatStarHunter(heated(5, GAME_DATA.starVariants.excludedAreas[0]), hunter(), sure).star, undefined, "the tutorial area stays plain");
  assert.equal(heatStarHunter(heated(5), hunter(), sure, { ...GAME_DATA.starVariants, enabled: false }).star, undefined);
  let stars = 0;
  const g = heated(9);
  for (let i = 0; i < 400; i++) if (heatStarHunter(g, hunter()).star) stars++;
  const want = HEAT.pressure.tiers[2].stars.reduce((a, s) => a + s.chance, 0);
  assert.ok(Math.abs(stars / 400 - want) < 0.1, `shipped chance is about ${want}, got ${stars / 400}`);
});

test("heat is session-only: a persisted run carries no heat", () => {
  const f = make({ data: shipped }),
    g = f.g;
  g.heat = { count: 7, lastKillAt: 0, seen: 0, rolls: 3 };
  assert.ok(f.p.persistRun(g));
  assert.ok(f.writes.length > 0);
  for (const w of f.writes) assert.ok(!/"heat"\s*:/.test(w.raw), "no heat key in the saved run");
});

test("the heat count is capped by the data row: kills past it add nothing, and the tally and tier lookup clamp to it", () => {
  assert.ok(HEAT.maxHeat >= HEAT.pressure.tiers.at(-1).minHeat);
  assert.ok(HEAT.maxHeat <= HEAT.world.maxGroups * HEAT.groupSize, "the tally has room for every mark");
  const g = fake();
  stepHeat(g);
  g.kills = HEAT.maxHeat + 20;
  g.time = 1;
  stepHeat(g);
  assert.equal(g.heat.count, HEAT.maxHeat);
  assert.equal(heatShown(g).count, HEAT.maxHeat);
  g.heat.count = HEAT.maxHeat + 50; // even a state past the cap reads as the cap
  assert.equal(heatShown(g).count, HEAT.maxHeat);
  assert.equal(heatTier(g), HEAT.pressure.tiers.at(-1));
  const bad = raw();
  bad.maxHeat = bad.pressure.tiers.at(-1).minHeat - 1;
  assert.throws(() => validateHeat(bad));
});

// A stub page: counts the canvases the tally view asks for, with a 2D context that accepts every drawing call.
function withStubPage(run) {
  const real = globalThis.document;
  let canvases = 0;
  globalThis.document = {
    createElement() {
      canvases++;
      const canvas = { width: 0, height: 0 };
      canvas.getContext = () => new Proxy({ canvas }, { get: (t, k) => (k in t ? t[k] : () => {}), set: () => true });
      return canvas;
    },
  };
  try {
    return run(() => canvases);
  } finally {
    globalThis.document = real;
  }
}

test("a fade builds no new texture: only a change of count does, and the newest mark's opacity does the dimming", () => {
  withStubPage((canvases) => {
    const added = [],
      scene = { add: (s) => added.push(s), remove() {} },
      view = createHeatTallyView(scene),
      at = new Vector3(1, 2, 3);
    view.update({ count: 7, lastAlpha: 1 }, at);
    const built = canvases();
    assert.equal(built, 2, "one texture for the settled marks, one for the newest");
    const alphas = [];
    for (let i = 0; i <= 70; i++) {
      const lastAlpha = 1 - (i / 70) * (1 - HEAT.decay.minAlpha);
      view.update({ count: 7, lastAlpha }, at);
      alphas.push(added.at(-1).material.opacity);
    }
    assert.equal(canvases(), built, "70 fade steps built nothing");
    assert.ok(alphas[0] > alphas.at(-1) && alphas.at(-1) >= HEAT.decay.minAlpha - 1e-9, "the newest mark dims");
    assert.equal(added.at(-2).material.opacity, 1, "the settled marks stay solid");
    view.update({ count: 8, lastAlpha: 1 }, at);
    assert.equal(canvases(), built + 2, "a new kill repaints once");
    view.update(null, at);
    view.dispose();
  });
});

test("the off-switch answer is worked out once per page and tiers are walked without sorting", () => {
  const tiers = HEAT.pressure.tiers;
  assert.deepEqual(tiers.map((t) => t.minHeat), [...tiers.map((t) => t.minHeat)].sort((a, b) => a - b));
  const calls = [];
  const real = globalThis.location;
  globalThis.location = { get search() { calls.push(1); return ""; } };
  try {
    const rules = { ...HEAT };
    for (let i = 0; i < 50; i++) assert.equal(heatEnabled(rules), true);
    assert.equal(calls.length, 1, "the address is read once");
  } finally {
    globalThis.location = real;
  }
});
