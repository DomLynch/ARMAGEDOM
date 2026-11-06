import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// The page asks for the waves (?waves=1) before any module reads the address.
// The spawn roll is seeded by the UTC day the session started; pin that day so the expectations below do not drift with the date.
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : ["2026-11-05T12:00:00Z"]));
  }
};
globalThis.location = { search: "?waves=1" };
const { GAME_DATA } = await import("../src/engine/game-data.js");
const { validateTrashWave } = await import("../src/engine/game-data-trash-wave.js");
const { createQualityTier } = await import("../src/engine/quality-tier.js");
const { webText } = await import("../src/engine/web-text.js");
const { respawnable } = await import("../src/engine/respawn.js");
const { KILL_DROPS, leaveKillDrops, stepKillDrops } = await import("../src/engine/kill-drops.js");
const { stepGame, rangedHit } = await import("../src/combat.js");
const { make } = await import("./helpers/marked-fixture.js");
const W = await import("../src/engine/trash-wave.js");
const {
  TRASH_WAVE: DATA,
  stepTrashWave,
  clearTrashWave,
  groupAmount,
  isBossWave,
  liveWaveMobs,
  liveCap,
  wavesEnabled,
  onWaveKill,
} = W;

const raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/trashWave.json", import.meta.url))));
const [TRASH, ELITE] = DATA.groups;
const tierOf = (name) => createQualityTier(GAME_DATA.qualityTier, `?quality=${name}`);
const metres = (g, p) => Math.hypot(p.x - g.player.pos.x, p.z - g.player.pos.z);
const inside = (g, radius) => (p) => metres(g, p) < radius;
const nowhere = () => false;

// An empty East area with the real geometry and the real combat game, so spawns face real walls and the real hollow factory.
function area() {
  const g = make({ areaId: "east" }).g;
  g.enemies = [];
  g.corpses = [];
  g.player.hp = g.player.maxHP = 100000; // the mobs may reach the player in the longer runs
  return g;
}
// Advances the clock by `seconds` in `dt` slices, stepping the waves each time. Returns the live wave mob count after each slice.
function run(g, seconds, services, dt = 0.1) {
  const counts = [];
  for (let spent = 0; spent < seconds - 1e-9; spent += dt) {
    g.time += dt;
    stepTrashWave(g, dt, services);
    counts.push(liveWaveMobs(g.enemies));
  }
  return counts;
}
const events = (g, type) => g.events.filter((e) => e.type === type);
const filler = (g, n, wave = 1, extra = {}) => {
  for (let i = 0; i < n; i++)
    g.enemies.push({
      id: 9000 + g.enemies.length,
      waveMob: true,
      waveId: wave,
      hp: 40,
      pos: { x: 500 + i, z: 500 },
      radius: 0.4,
      bornAt: g.time,
      ...extra,
    });
};

test("the data validates, refuses broken rows, and ships switched off with its text and tiers in place", () => {
  assert.doesNotThrow(() => validateTrashWave(raw()));
  const bad = [
    (d) => {
      d.extra = 1;
    },
    (d) => {
      d.spawn.perFrame = 5;
    },
    (d) => {
      d.drops.maxPerWave = 3;
    },
    (d) => {
      d.tiers.low.liveCap = d.tiers.full.liveCap + 1;
    },
    (d) => {
      d.groups[0].kind = "boss";
    },
    (d) => {
      d.spawn.ringInnerMetres = d.spawn.minPlayerMetres - 1;
    },
    (d) => {
      delete d.groups[0].sizes.low;
    },
    (d) => {
      d.groups[0].sizes.full.max = 1;
    },
    (d) => {
      d.startSwitch.value = "Yes!";
    },
    (d) => {
      d.groups = d.groups.filter((g) => g.kind !== "trash");
    },
    (d) => {
      d.mobs.pursuit.pursuitScope = "home";
    },
  ];
  for (const mutate of bad) {
    const d = raw();
    mutate(d);
    assert.throws(() => validateTrashWave(d));
  }
  assert.equal(DATA.wavesEnabledDefault, true);
  assert.deepEqual(
    Object.keys(DATA.tiers),
    GAME_DATA.qualityTier.tiers.map((t) => t.name),
  );
  assert.ok(GAME_DATA.killDrops.tiers[DATA.drops.tier], "the wave drop tier is a killDrops tier");
  assert.equal(GAME_DATA.killDrops.enabled, true, "the shared coin drops are on for every enemy too");
  for (const id of ["wave.announce", "wave.elite", "wave.boss", "wave.cleared"])
    assert.ok(webText(id, { wave: 1, hp: 25, score: 0 }));
});

test("the switch: on by default, ?nowaves=1 turns it off, and the whole row can be disabled", () => {
  assert.equal(wavesEnabled(DATA, ""), true);
  assert.equal(wavesEnabled(DATA, "?waves=0"), true);
  assert.equal(wavesEnabled(DATA, "?nowaves=1"), false);
  assert.equal(wavesEnabled(DATA, "?quality=low&waves=1&nowaves=1"), false, "the off switch wins");
  const optIn = { ...DATA, wavesEnabledDefault: false };
  assert.equal(wavesEnabled(optIn, ""), false);
  assert.equal(wavesEnabled(optIn, "?quality=low&waves=1"), true);
  assert.equal(wavesEnabled({ ...DATA, enabled: false }, "?waves=1"), false);
});

test("group size formula: 8 growing 6% a wave to 16 on full, 6 to 12 on mid, 5 to 8 on low; elites every fifth wave to 3", () => {
  const sizes = (group, tier, waves) => waves.map((w) => groupAmount(group, tier, w));
  assert.deepEqual(sizes(TRASH, "full", [1, 2, 3, 4, 11, 17, 18, 40]), [8, 8, 9, 9, 13, 16, 16, 16]);
  assert.deepEqual(sizes(TRASH, "mid", [1, 3, 11, 18, 40]), [6, 7, 10, 12, 12]);
  assert.deepEqual(sizes(TRASH, "low", [1, 3, 11, 18, 40]), [5, 6, 8, 8, 8]);
  for (const tier of ["full", "mid", "low"]) {
    const max = Math.max(...Array.from({ length: 80 }, (_, i) => groupAmount(TRASH, tier, i + 1)));
    assert.equal(max, TRASH.sizes[tier].max);
  }
  assert.deepEqual(sizes(ELITE, "full", [1, 4, 5, 6, 10, 15, 20, 25, 30]), [0, 0, 1, 0, 2, 3, 3, 3, 3]);
  assert.equal(groupAmount(TRASH, "full", 0), 0, "nothing before begin");
  assert.deepEqual(
    [10, 11, 12, 21, 22, 23].map((w) => isBossWave(w)),
    [false, true, false, false, true, false],
  );
});

test("live caps by tier: 24 full, 16 mid, 10 low", () => {
  assert.deepEqual(
    ["full", "mid", "low"].map((t) => liveCap(t)),
    [24, 16, 10],
  );
});

test("flag off: no state is created and nothing changes, even over a long run", () => {
  const g = area();
  g.enemies.push({ id: 7, hp: 40, pos: { x: 1, z: 1 }, radius: 0.4 });
  const before = JSON.stringify({ ...g, world: undefined, events: undefined }),
    keys = Object.keys(g).sort(),
    list = g.enemies;
  for (let i = 0; i < 2000; i++) {
    g.time += 0.1;
    stepTrashWave(g, 0.1, { pointOnScreen: nowhere }, DATA, "?nowaves=1");
  }
  assert.equal("trashWave" in g && g.trashWave != null, false);
  assert.deepEqual(Object.keys(g).sort(), keys);
  assert.equal(g.enemies, list);
  assert.equal(g.events.length, 0);
  const after = JSON.stringify({ ...g, world: undefined, events: undefined });
  assert.equal(after.replace(/"time":[\d.e+-]+/, ""), before.replace(/"time":[\d.e+-]+/, ""));
  assert.equal(leaveKillDrops(g, KILL_OFF), 0);
  assert.equal(g.killDrops, undefined);
});

test("clock: the first wave comes after firstWaveSeconds, then the clock repeats; the safehouse and excluded areas never start one", () => {
  const g = area(),
    services = { pointOnScreen: inside(g, 12) };
  run(g, DATA.firstWaveSeconds - 1, services);
  assert.equal(events(g, "trash-wave-start").length, 0);
  run(g, 1.2, services);
  const [start] = events(g, "trash-wave-start");
  assert.equal(start.wave, 1);
  assert.equal(start.size, 8);
  assert.equal(g.trashWave.clock, DATA.clockSeconds);
  assert.match(g.message, /Wave 1/);
  const hub = area();
  hub.world = { ...hub.world, areaId: "central-hub" };
  run(hub, 60, services);
  assert.equal(hub.trashWave ?? null, null, "an excluded area has no waves");
  assert.equal(hub.enemies.length, 0);
});

test("spawns at most four mobs a step and never past the tier's live cap", () => {
  const g = area(),
    services = { pointOnScreen: inside(g, 12) };
  run(g, 0.1, services);
  g.trashWave.clock = 0;
  const counts = run(g, 12, services),
    steps = counts.map((n, i) => n - (counts[i - 1] ?? 0));
  assert.ok(Math.max(...steps) <= 4, `per step ${steps}`);
  assert.equal(counts.at(-1), 8, "the whole first wave arrived");
  for (const [name, cap] of [
    ["low", 10],
    ["mid", 16],
  ]) {
    const h = area(),
      s = { pointOnScreen: inside(h, 12), quality: tierOf(name) };
    filler(h, cap - 3);
    run(h, 0.1, s);
    h.trashWave.clock = 0;
    const seen = run(h, 12, s);
    assert.ok(Math.max(...seen) <= cap, `${name} stays within ${cap}: ${Math.max(...seen)}`);
    assert.equal(Math.max(...seen), cap, `${name} reaches the cap`);
    assert.ok(h.trashWave.queue.length > 0, "the rest of the wave waits in the queue");
  }
});

test("clock pauses while more than ten live, ticks at ten; an early start needs two or fewer live and eight seconds since the last wave", () => {
  const g = area(),
    services = { pointOnScreen: nowhere };
  run(g, 0.1, services);
  const state = g.trashWave;
  Object.assign(state, { wave: 1, lastWaveAt: g.time, clock: 25 });
  filler(g, 11);
  run(g, 5, services);
  assert.equal(state.clock, 25, "11 alive: the clock is paused");
  g.enemies.pop();
  run(g, 5, services);
  assert.ok(Math.abs(state.clock - 20) < 1e-6, `10 alive: the clock runs (${state.clock})`);
  // Early start.
  g.enemies = [];
  filler(g, 3);
  Object.assign(state, { clock: 25, lastWaveAt: g.time });
  run(g, 20, services);
  assert.equal(state.wave, 1, "three alive: no early start");
  g.enemies.pop();
  Object.assign(state, { clock: 99, lastWaveAt: g.time });
  run(g, 7.5, services);
  assert.equal(state.wave, 1, "two alive but under eight seconds since the last wave");
  run(g, 1, services);
  assert.equal(state.wave, 2, "two alive and eight seconds: the next wave starts early");
});

test("an elite wave (every fifth) is announced, and after it is cleared there is a six second breather", () => {
  const g = area(),
    services = { pointOnScreen: inside(g, 12) };
  run(g, 0.1, services);
  const state = g.trashWave;
  Object.assign(state, { wave: 4, clock: 0.05, lastWaveAt: g.time });
  run(g, 10, services);
  const [start] = events(g, "trash-wave-start");
  assert.deepEqual([start.wave, start.elite], [5, true]);
  assert.match(g.message, /elite/);
  const elites = g.enemies.filter((e) => e.elite);
  assert.equal(elites.length, 1);
  assert.equal(elites[0].hp, 80);
  assert.ok(elites[0].star, "the elite wears the star variant");
  // Clear the wave: the next one waits breatherSeconds even though the early-start test would pass.
  g.time += 20;
  g.enemies = [];
  run(g, 0.1, services);
  const cleared = g.time;
  run(g, DATA.pacing.breatherSeconds - 0.5, services);
  assert.equal(state.wave, 5, "still in the breather");
  run(g, 1, services);
  assert.equal(state.wave, 6);
  assert.ok(g.time - cleared >= DATA.pacing.breatherSeconds - 0.11);
  const boss = area();
  run(boss, 0.1, services);
  Object.assign(boss.trashWave, { wave: 10, clock: 0.05, lastWaveAt: boss.time });
  run(boss, 0.2, services);
  assert.equal(events(boss, "trash-wave-boss")[0].wave, 11);
  assert.match(boss.message, /worse/);
});

test("spawn ring: never in view, never within 8 m, on clear ground, off exits, free of bodies; a pack's followers stay within 2 m", () => {
  const g = area(),
    services = { pointOnScreen: inside(g, 15) };
  run(g, 0.1, services);
  g.trashWave.clock = 0;
  run(g, 12, services);
  const mobs = g.enemies.filter((e) => e.waveMob);
  assert.equal(mobs.length, 8);
  for (const m of mobs) {
    assert.ok(metres(g, m.pos) >= 15, `outside the view (${metres(g, m.pos).toFixed(1)} m)`);
    assert.ok(metres(g, m.pos) >= DATA.spawn.minPlayerMetres);
    assert.ok(g.world.geometry.clear(m.pos, DATA.spawn.bodyRadius), "clear ground");
  }
  for (const a of mobs)
    for (const b of mobs) if (a !== b) assert.ok(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > 0.8, "no overlap");
  const near = mobs.map(
    (a) =>
      mobs.filter((b) => b !== a && Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) <= 2 * DATA.spawn.followerRadius)
        .length,
  );
  assert.ok(
    near.every((n) => n >= DATA.spawn.packMin - 1),
    `every mob stands in a pack of ${DATA.spawn.packMin}+ ${near}`,
  );
  // Everything in view, everything blocked and a body on every cell: the wave defers and spawns nothing.
  const blocked = [{ pointOnScreen: () => true }, { pointOnScreen: nowhere, blockGround: true }];
  for (const services2 of blocked) {
    const h = area();
    if (services2.blockGround) h.world = { ...h.world, geometry: { ...h.world.geometry, clear: () => false } };
    run(h, 0.1, services2);
    h.trashWave.clock = 0;
    const counts = run(h, 5, services2);
    assert.equal(Math.max(...counts), 0);
    assert.ok(h.trashWave.queue.length > 0, "the wave waits for the next tick");
  }
  const crowded = area();
  const here = crowded.player.pos;
  run(crowded, 0.1, { pointOnScreen: nowhere });
  crowded.trashWave.clock = 0;
  const rng = (() => {
    let s = 1;
    return () => (s = (s * 48271) % 2147483647) / 2147483647;
  })();
  for (let i = 0; i < 500; i++) {
    const a = rng() * 6.283,
      r = 8 + rng() * 40;
    crowded.enemies.push({
      id: 800 + i,
      hp: 40,
      pos: { x: here.x + Math.cos(a) * r, z: here.z + Math.sin(a) * r },
      radius: 0.4,
    });
  }
  const before = crowded.enemies.length;
  run(crowded, 4, { pointOnScreen: nowhere });
  const arrived = crowded.enemies.slice(before);
  assert.ok(arrived.length > 0, "some cells were still free");
  for (const m of arrived) {
    const others = crowded.enemies.filter((e) => e !== m);
    assert.ok(
      others.every(
        (e) => Math.hypot(e.pos.x - m.pos.x, e.pos.z - m.pos.z) >= 0.4 + 0.4 + DATA.spawn.occupiedGap - 1e-9,
      ),
      "spawned only on a free cell",
    );
  }
});

test("a wave mob is a plain 40 HP hollow that hunts at once, holds its attacks five seconds, and is outside every other system's counts", () => {
  const g = area(),
    services = { pointOnScreen: inside(g, 12) };
  run(g, 0.1, services);
  g.trashWave.clock = 0;
  run(g, 12, services);
  const mob = g.enemies.find((e) => e.waveMob && !e.elite);
  assert.equal(mob.rig, "hollow-scavenger");
  assert.equal(mob.maxHP, g.encounter.health);
  assert.equal(mob.maxHP, 40);
  assert.equal(mob.placementKey, undefined, "no placement key: no award, loot ledger, journal row or crowd-pool entry");
  assert.equal(mob.markedHunter, undefined, "not a marked hunter: maxHunters and the hunter cap never count it");
  assert.equal(respawnable(g, mob), false, "never enters the respawn path");
  assert.equal(mob.alerted, true);
  assert.equal(mob.residentIntent.pursuitScope, "area");
  assert.equal(mob.residentIntent.wakeDistance, 1000);
  assert.ok(Math.abs(mob.ready - (mob.bornAt + DATA.spawn.graceSeconds)) < 1e-9);
  assert.equal(mob.moveSpeed, g.encounter.moveSpeed);
  assert.equal(g.enemies.filter((e) => e.markedHunter).length, 0);
});

test("run-scoped: leaving the area, dying or ending a run removes the mobs, their corpses, parked copies and drops", () => {
  const services = { pointOnScreen: inside(area(), 12) };
  const spawned = () => {
    const g = area();
    run(g, 0.1, { pointOnScreen: inside(g, 12) });
    g.trashWave.clock = 0;
    run(g, 12, { pointOnScreen: inside(g, 12) });
    g.corpses.push({ id: 1, waveMob: true, hp: 0, pos: { x: 1, z: 1 } }, { id: 2, hp: 0, pos: { x: 2, z: 2 } });
    g.areaFights = { east: { enemies: [...g.enemies], corpses: [{ id: 3, waveMob: true, hp: 0 }] } };
    g.killDrops = { list: [{ id: 1, wave: true }, { id: 2 }], serial: 2, notice: 0 };
    g.enemies.push({ id: 5, hp: 40, pos: { x: 9, z: 9 }, radius: 0.4 });
    assert.ok(liveWaveMobs(g.enemies) > 0);
    return g;
  };
  const clean = (g) => {
    assert.equal(g.trashWave, null);
    assert.equal(g.enemies.filter((e) => e.waveMob).length, 0);
    assert.deepEqual(
      g.enemies.map((e) => e.id),
      [5],
      "a resident is left alone",
    );
    assert.deepEqual(
      g.corpses.map((e) => e.id),
      [2],
    );
    assert.equal(g.areaFights.east.enemies.filter((e) => e.waveMob).length, 0);
    assert.equal(g.areaFights.east.corpses.length, 0);
    assert.deepEqual(
      g.killDrops.list.map((d) => d.id),
      [2],
    );
  };
  let g = spawned();
  clearTrashWave(g);
  clean(g);
  g = spawned();
  g.world = { ...g.world, areaId: "south" };
  stepTrashWave(g, 0.1, services);
  assert.equal(g.trashWave.areaId, "south", "a fresh state for the new area");
  assert.equal(g.enemies.filter((e) => e.waveMob).length, 0);
  assert.equal(g.areaFights.east.enemies.filter((e) => e.waveMob).length, 0, "the parked east copy is gone too");
  g = spawned();
  g.player.hp = 0;
  stepTrashWave(g, 0.1, services);
  clean(g);
  g = spawned();
  g.run = { outcome: "escaped" };
  stepTrashWave(g, 0.1, services);
  clean(g);
  g = spawned();
  g.finished = true;
  stepGame(g, {}, 1 / 60, services);
  clean(g);
});

test("a mob stuck out of view is removed so it cannot hold the cap or pause the clock; one in view or in melee is kept", () => {
  const g = area(),
    services = { pointOnScreen: inside(g, 12) };
  run(g, 0.1, services);
  const here = g.player.pos,
    at = (x) => ({ x: here.x + x, z: here.z });
  const make = (id, pos) => ({
    id,
    waveMob: true,
    waveId: 1,
    hp: 40,
    pos,
    radius: 0.4,
    bornAt: g.time,
    waveAx: pos.x,
    waveAz: pos.z,
    waveAt: g.time,
  });
  const stuck = make(1, at(30)),
    seen = make(2, at(9)),
    melee = make(3, at(3)),
    walker = make(4, at(40));
  g.enemies.push(stuck, seen, melee, walker);
  Object.assign(g.trashWave, { wave: 1, clock: 999 });
  const every = DATA.spawn.stuckSeconds / 3;
  for (let i = 0; i < 4; i++) {
    walker.pos = at(40 + (i + 1) * 3);
    run(g, every, services);
  }
  assert.ok(!g.enemies.includes(stuck), "stuck, far and unseen: removed");
  assert.ok(g.enemies.includes(seen) && g.enemies.includes(melee), "in view and in melee: kept");
  assert.ok(g.enemies.includes(walker), "a mob that keeps moving is not stuck");
  assert.equal(g.corpses.length, 0, "removed without a kill, so no corpse, score or drop");
  assert.equal(g.trashWave.score, 0);
});

test("deterministic: the same seed and view give the same waves, cell for cell", () => {
  const sample = () => {
    const g = area(),
      services = { pointOnScreen: inside(g, 12) };
    run(g, 0.1, services);
    g.trashWave.clock = 0;
    run(g, 12, services); // under stuckSeconds: nothing here moves, so a longer run would cull them all
    return g.enemies
      .filter((e) => e.waveMob)
      .map((e) => [e.elite, +e.pos.x.toFixed(6), +e.pos.z.toFixed(6), e.mobSize]);
  };
  const a = sample(),
    b = sample();
  assert.ok(a.length >= 8);
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Rewards and drops (the Lead's brief): wave CLEAR heals and refills, a session score is shown, and only the elite and the last mob drop.

function wave(g, ids, { wave: id = 1, elite = [] } = {}) {
  if (!g.trashWave) run(g, 0.1, { pointOnScreen: nowhere }); // creates the state; later waves reuse it without stepping the director
  g.trashWave.wave = id;
  return ids.map((n) => {
    const e = {
      id: 7000 + n + id * 100,
      waveMob: true,
      waveId: id,
      elite: elite.includes(n),
      hp: 40,
      pos: { x: 3, z: 3 },
      radius: 0.4,
      rig: "hollow-scavenger",
    };
    g.enemies.push(e);
    return e;
  });
}
const kill = (g, e) => {
  e.hp = 0;
  g.enemies = g.enemies.filter((x) => x !== e);
  g.corpses.push(e);
  g.events = [{ type: "death", actor: e }];
};

// The shared coin drops switched off (they ship on), for the tests that look at the wave-only path.
const KILL_OFF = { ...KILL_DROPS, enabled: false };
test("flag filter: with shared coin drops off, only a wave mob that is the elite or last of its wave drops, as a $1-10 trash coin", () => {
  const g = area();
  const [a, b, c] = wave(g, [1, 2, 3]);
  g.time = 100;
  for (const e of [a, b]) {
    kill(g, e);
    assert.equal(leaveKillDrops(g, KILL_OFF), 0, "neither of the first two kills pays");
  }
  assert.equal(g.killDrops, undefined, "no drop state until something pays");
  kill(g, c);
  assert.equal(leaveKillDrops(g, KILL_OFF), 1, "the last mob of the wave pays");
  const [drop] = g.killDrops.list;
  assert.equal(drop.tier, "trash");
  assert.ok(drop.amount >= KILL_DROPS.tiers.trash.min && drop.amount <= KILL_DROPS.tiers.trash.max);
  assert.equal(drop.wave, true);
  assert.equal(drop.enemy, "hollow-scavenger");
  assert.equal(drop.until, g.time + DATA.drops.despawnSeconds);
  assert.ok(DATA.drops.despawnSeconds < KILL_DROPS.despawnSeconds);
  // An ordinary enemy still drops nothing while the shared switch is off.
  g.events = [{ type: "death", actor: { id: 1, pos: { x: 1, z: 1 }, rig: "original-rat", hp: 0 } }];
  assert.equal(leaveKillDrops(g, KILL_OFF), 0);
  // The drop is walkable like any other (the claim goes through the normal path) and the view/step gate lets it run.
  g.player.pos = { x: drop.x, z: drop.z };
  g.marked ??= { carried: 0, bank: 0 };
  stepKillDrops(g);
  assert.equal(g.killDrops.list.length, 0, "taken");
});

test("flag off: a wave mob's death drops nothing and awards nothing", () => {
  const g = area();
  const [a] = wave(g, [1]);
  g.time = 100;
  kill(g, a);
  const off = { ...DATA, enabled: false };
  assert.equal(leaveKillDrops(g, KILL_OFF, off), 0);
  assert.equal(g.killDrops, undefined);
  assert.equal(g.trashWave.score, 0, "no kill score either");
  const plain = area();
  const x = { id: 1, waveMob: true, waveId: 1, hp: 0, pos: { x: 1, z: 1 }, rig: "hollow-scavenger" };
  plain.events = [{ type: "death", actor: x }];
  assert.equal(leaveKillDrops(plain, KILL_OFF), 0, "no wave state at all: nothing");
  assert.equal(plain.killDrops, undefined);
  assert.equal(onWaveKill(plain, x), false);
});

test("only-last rule: the elite pays, the last mob pays, nobody else, and never more than two a wave", () => {
  const g = area();
  const [e1, e2, t1, t2, t3] = wave(g, [1, 2, 3, 4, 5], { elite: [1, 2] });
  let paid = 0;
  for (const [i, m] of [e1, t1, t2, e2, t3].entries()) {
    g.time = 100 + i * 10;
    kill(g, m);
    paid += leaveKillDrops(g);
  }
  assert.equal(paid, 2, "two elites and a last mob are three candidates: only two pay");
  assert.equal(g.killDrops.list.length, 2);
  assert.equal(g.trashWave.tally[1].paid, 2);
});

test("drops are spaced so the claim queue cannot back up, and the list keeps at most maxDrops (oldest out)", () => {
  const g = area();
  const [one, two] = wave(g, [1, 2], { wave: 1, elite: [1, 2] });
  g.time = 100;
  kill(g, one);
  assert.equal(leaveKillDrops(g), 1);
  g.time = 100 + DATA.drops.minSecondsBetween - 1;
  kill(g, two);
  assert.equal(leaveKillDrops(g), 0, "a second paying kill inside minSecondsBetween is refused");
  // Twelve waves, one paying last mob each, far enough apart: the list never passes maxDrops.
  const h = area();
  const ids = [];
  for (let w = 1; w <= 12; w++) {
    const [m] = wave(h, [1], { wave: w });
    h.time = 1000 + w * 10;
    kill(h, m);
    assert.equal(leaveKillDrops(h), 1, `wave ${w} pays`);
    ids.push(h.killDrops.list.at(-1).id);
    assert.ok(h.killDrops.list.length <= KILL_DROPS.maxDrops);
  }
  assert.equal(h.killDrops.list.length, KILL_DROPS.maxDrops);
  assert.deepEqual(
    h.killDrops.list.map((d) => d.id),
    ids.slice(2),
    "the two oldest were evicted",
  );
  // Per claim minute the worst case stays inside the server's roughly twelve claims a minute.
  assert.ok(60 / DATA.drops.minSecondsBetween <= 12);
});

test("wave clear: heals the waveClearHeal amount, tops up ammo, adds the session score and says so; the score is never cash", () => {
  const g = area();
  g.player.maxHP = 100;
  g.player.hp = 40;
  const [a, b] = wave(g, [1, 2], { wave: 3 });
  g.time = 50;
  kill(g, a);
  leaveKillDrops(g);
  assert.equal(g.player.hp, 40, "not cleared yet");
  assert.equal(g.trashWave.score, DATA.rewards.score.perKill);
  kill(g, b);
  leaveKillDrops(g);
  assert.equal(g.player.hp, 40 + GAME_DATA.combatRules.legacy.waveClearHeal);
  const score = 2 * DATA.rewards.score.perKill + DATA.rewards.score.clearBase + 3 * DATA.rewards.score.clearPerWave;
  assert.equal(g.trashWave.score, score);
  assert.equal(g.trashWave.cleared, 1);
  assert.match(g.message, new RegExp(`Wave 3 cleared.*\\+25 HP.*Score ${score}`));
  assert.equal(events(g, "trash-wave-clear").length, 1);
  assert.equal(g.marked?.carried ?? 0, 0, "no cash moved");
  kill(g, a); // the same wave cannot clear twice
  leaveKillDrops(g);
  assert.equal(g.trashWave.cleared, 1);
  // A wave that still has mobs waiting in the spawn queue is not cleared.
  const h = area();
  const [only] = wave(h, [1], { wave: 2 });
  h.trashWave.queue.push({ wave: 2, kind: "trash", pack: { anchor: null }, leader: true, turns: 0 });
  kill(h, only);
  leaveKillDrops(h);
  assert.equal(h.trashWave.cleared, 0);
});

test("wave corpses are capped at corpseKeep, newest kept", () => {
  const g = area();
  const mobs = wave(
    g,
    Array.from({ length: 20 }, (_, i) => i + 1),
  );
  g.time = 10;
  for (const m of mobs) {
    kill(g, m);
    leaveKillDrops(g);
  }
  const left = g.corpses.filter((c) => c.waveMob);
  assert.equal(left.length, DATA.spawn.corpseKeep);
  assert.equal(left.at(-1), mobs.at(-1));
});

test("through the real combat loop: waves spawn, hunt, wait out the grace, die by the real hit path, and pay on the clear", () => {
  const g = area(),
    services = { pointOnScreen: inside(g, 12) };
  const tick = () => {
    stepGame(g, {}, 1 / 60, services);
    leaveKillDrops(g);
  };
  while (g.time < DATA.firstWaveSeconds + 3) tick();
  const mobs = g.enemies.filter((e) => e.waveMob);
  assert.equal(mobs.length, 8, "wave 1 is out");
  const first = mobs.map((m) => metres(g, m.pos));
  const born = Math.max(...mobs.map((m) => m.bornAt));
  while (g.time < born + 3) tick();
  assert.ok(
    mobs.every((m) => !m.swing),
    "no attack inside the five second grace",
  );
  const later = mobs.map((m) => metres(g, m.pos));
  assert.ok(later.reduce((a, b) => a + b) < first.reduce((a, b) => a + b), "they close on the player");
  assert.equal(g.enemies.filter((e) => e.markedHunter && e.waveMob).length, 0);
  const hp = g.player.hp;
  g.player.maxHP = 200;
  g.player.hp = 100;
  const killsBefore = g.kills;
  for (const m of g.enemies.filter((e) => e.waveMob)) {
    rangedHit(g, { targetId: m.id, direction: { x: 1, z: 0 } }, "pistol", "pistol", 999);
    leaveKillDrops(g);
  }
  assert.equal(g.kills - killsBefore, 8, "kills feed the normal count (and so heat)");
  assert.equal(g.trashWave.cleared, 1);
  assert.equal(g.player.hp, 125);
  assert.equal(g.killDrops.list.length, 1, "one coin, from the last mob");
  assert.ok(hp > 0);
});
