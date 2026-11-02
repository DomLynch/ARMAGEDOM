// Headless creature sim: it must run the same creature code as single-player (parity with stepGame), target the
// nearest of several players, clamp hit claims to the weapon rules and contain a failed step.
import test from "node:test";
import assert from "node:assert/strict";
import { stepGame } from "../src/combat.js";
import { createCreatureSim } from "../src/engine/creature-sim.js";
import { fixture } from "./helpers/rifle-fixture.js";

const BOSS = "boss-warden-v1";
const TICK = 1 / 60;

// A fresh renderer-free run with the Bridge Warden woken, `gap` metres from the player on clear ground.
function arena(gap = 2) {
  const f = fixture({ areaId: "east-bridge" }),
    g = f.g,
    boss = g.enemies.find((e) => e.placementKey === BOSS);
  assert(boss, "boss present");
  const anchor = { ...boss.pos };
  boss.home = { ...anchor };
  boss.alerted = true;
  for (let i = 0; i < 72; i++) {
    const a = (i * Math.PI) / 36,
      spot = { x: anchor.x + Math.cos(a) * gap, z: anchor.z + Math.sin(a) * gap };
    if (!f.world.geometry.clear(spot, g.player.radius) || !f.world.lineClear(spot, anchor)) continue;
    g.player.pos = spot;
    g.player.facing = { x: Math.cos(a + Math.PI), z: Math.sin(a + Math.PI) };
    g.enemies = [boss];
    g.encounterActive = true;
    return { f, g, boss, spot };
  }
  throw Error("no clear spot");
}
const report = (g, hp) => ({
  id: "p1",
  pos: { ...g.player.pos },
  facing: { ...g.player.facing },
  ...(hp === undefined ? {} : { hp }),
});
// Rounded to 1e-9: the player's own facing is carried slightly differently by the two runs (float noise only).
const round = (key, value) => (typeof value === "number" ? Math.round(value * 1e9) / 1e9 : value);
const trace = (boss, hp) => JSON.stringify({ pos: boss.pos, facing: boss.facing, hp: boss.hp, php: hp }, round);

test("parity: the sim moves and hurts like stepGame for the same boss and a standing player", () => {
  const single = arena(),
    shared = arena(),
    sim = createCreatureSim({ game: shared.g }),
    a = [],
    b = [];
  for (let i = 0; i < 360; i++) {
    stepGame(single.g, {}, TICK, {});
    single.g.player.pos = { ...single.spot }; // the player stands still in both runs
    a.push(trace(single.boss, single.g.player.hp));
    const out = sim.step({ players: [report(shared.g)], dt: TICK });
    assert(out.ok, out.error);
    b.push(trace(shared.boss, sim.player("p1").hp));
  }
  const first = a.findIndex((row, i) => row !== b[i]);
  assert.equal(first, -1, `first divergence at tick ${first}: stepGame ${a[first]} vs sim ${b[first]}`);
  assert(JSON.parse(a.at(-1)).php < single.g.player.maxHP, "the boss actually hurt the player in the window");
});

test("two players: each creature goes for the nearest living player; the hurt event names that player", () => {
  const { g, boss, spot } = arena(),
    sim = createCreatureSim({ game: g }),
    far = { id: "far", pos: { x: spot.x + 30, z: spot.z + 30 }, facing: { x: 1, z: 0 } },
    near = { id: "near", pos: { ...spot }, facing: { x: -1, z: 0 } },
    hurt = [];
  for (let i = 0; i < 360; i++) {
    const out = sim.step({ players: [far, near], dt: TICK });
    assert(out.ok, out.error);
    hurt.push(...out.events.filter((e) => e.type === "hurt"));
  }
  assert(hurt.length > 0 && hurt.every((e) => e.playerId === "near"));
  assert.equal(sim.player("far").hp, sim.player("far").maxHP ?? sim.player("far").hp);
  assert(boss.hp > 0);
});

test("two players in reach of the same boss are both hurt (a swing can hit each of them once)", () => {
  const { g, spot } = arena(),
    sim = createCreatureSim({ game: g }),
    a = { id: "a", pos: { ...spot }, facing: { x: 1, z: 0 } },
    b = { id: "b", pos: { x: spot.x + 0.05, z: spot.z + 0.05 }, facing: { x: 1, z: 0 } },
    hurt = new Set();
  for (let i = 0; i < 600; i++) {
    const out = sim.step({ players: [a, b], dt: TICK });
    assert(out.ok, out.error);
    for (const e of out.events) if (e.type === "hurt") hurt.add(e.playerId);
  }
  assert.deepEqual([...hurt].sort(), ["a", "b"]);
});

test("a hit claim is clamped to the weapon rule; unknown weapons and impossible damage are dropped", () => {
  const { g, boss, spot } = arena(),
    sim = createCreatureSim({ game: g }),
    rules = { knife: { maxDamagePerHit: 5 } },
    p = { id: "p1", pos: { ...spot }, facing: { x: 1, z: 0 } },
    start = boss.hp;
  let out = sim.step({
    players: [p],
    dt: TICK,
    rules,
    hits: [{ creatureId: boss.id, playerId: "p1", weapon: "knife", damage: 9999 }],
  });
  assert(out.ok);
  assert.equal(start - boss.hp, 5, "damage is capped at the rule");
  assert.deepEqual(
    out.events.filter((e) => e.type === "creature-hit").map((e) => e.amount),
    [5],
  );
  const hp = boss.hp;
  out = sim.step({
    players: [p],
    dt: TICK,
    rules,
    hits: [
      { creatureId: boss.id, playerId: "p1", weapon: "unknown-gun", damage: 3 },
      { creatureId: boss.id, playerId: "p1", weapon: "knife", damage: -4 },
      { creatureId: boss.id, playerId: "p1", weapon: "knife", damage: NaN },
    ],
  });
  assert.equal(boss.hp, hp);
});

test("a death claim reports the kill once", () => {
  const { g, boss, spot } = arena(),
    sim = createCreatureSim({ game: g }),
    p = { id: "p1", pos: { ...spot }, facing: { x: 1, z: 0 } },
    out = sim.step({
      players: [p],
      dt: TICK,
      rules: { knife: { maxDamagePerHit: 1e6 } },
      hits: [{ creatureId: boss.id, playerId: "p1", weapon: "knife", damage: boss.hp }],
    });
  assert(out.ok);
  assert.equal(out.events.filter((e) => e.type === "creature-death").length, 1);
  assert.equal(out.creatures.find((c) => c.id === boss.id)?.alive ?? false, false);
});

test("a failed step is contained and the last good snapshot stands", () => {
  const { g, spot } = arena(),
    sim = createCreatureSim({ game: g }),
    p = { id: "p1", pos: { ...spot }, facing: { x: 1, z: 0 } },
    good = sim.step({ players: [p], dt: TICK });
  assert(good.ok);
  const bad = sim.step({ players: [p], dt: -1 });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.creatures, good.creatures);
  assert(sim.step({ players: [p], dt: TICK }).ok, "the sim keeps working after a failure");
});
