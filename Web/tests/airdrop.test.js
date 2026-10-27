import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateAirdrop } from "../src/engine/game-data-airdrop.js";
import { stepAirdrop, airdropPull, pickLanding } from "../src/engine/airdrop.js";
import { registerAirdropOutcome, medkit, cash } from "../src/engine/airdrop-effects.js";

const DATA = GAME_DATA.airdrop,
  raw = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/airdrop.json", import.meta.url)))),
  STEP = 1 / 60;

function game({ areaId = "east", exits = () => null, clear = () => true } = {}) {
  let n = 0;
  const roll = [0.37, 0.81, 0.12, 0.64, 0.55, 0.9, 0.2, 0.73];
  return {
    time: 0,
    random: () => roll[n++ % roll.length],
    player: { pos: { x: 0, z: 0 }, hp: 50, maxHP: 100 },
    marked: { carried: 0, bank: 0 },
    world: { areaId, geometry: { clear }, lineClear: () => true, travelAt: exits, markedData: { maxMoney: 100000 } },
    enemies: [],
  };
}
const run = (g, seconds) => {
  for (let t = 0; t < seconds; t += STEP) {
    g.time += STEP;
    stepAirdrop(g, STEP);
  }
};
const until = (g, phase, limit = 600) => {
  for (let t = 0; t < limit && g.airdrop?.phase !== phase; t += STEP) run(g, STEP);
  assert.equal(g.airdrop?.phase, phase);
};

test("the airdrop data validates and the validator refuses broken rows", () => {
  assert.doesNotThrow(() => validateAirdrop(raw()));
  for (const mutate of [
    (d) => { d.schedule.firstDelayMax = 1; },
    (d) => { d.view.flareColour = "red"; },
    (d) => { d.loot.bundle.push({ id: "banana" }); },
    (d) => { d.extra = 1; },
    (d) => { d.landing.attempts = 0; },
    (d) => { d.excludedAreas = [3]; },
  ]) {
    const d = raw();
    mutate(d);
    assert.throws(() => validateAirdrop(d));
  }
});

test("no airdrop in the tutorial or the hub, and none without an area", () => {
  for (const areaId of ["westminster", "central-hub", null]) {
    const g = game({ areaId });
    run(g, DATA.schedule.firstDelayMax + 1);
    assert(!g.airdrop);
  }
});

test("the first plane comes after the first delay and the crate lands in range on a clear spot", () => {
  const g = game();
  run(g, DATA.schedule.firstDelayMin - 1);
  assert.equal(g.airdrop.phase, "idle");
  until(g, "plane");
  assert(g.time >= DATA.schedule.firstDelayMin && g.time <= DATA.schedule.firstDelayMax + 1);
  assert.equal(g.message, GAME_DATA.webText.texts["airdrop.incoming"]);
  const reach = Math.hypot(g.airdrop.crate.x, g.airdrop.crate.z);
  assert(reach >= DATA.landing.minDistance && reach <= DATA.landing.maxDistance);
  until(g, "falling");
  assert.match(g.airdrop.hud, /INCOMING/);
  until(g, "landed");
  assert.match(g.airdrop.hud, /^AIRDROP · \d+m$/);
});

test("the next plane is one interval after the last one started", () => {
  const g = game();
  until(g, "plane");
  const started = g.time;
  until(g, "landed");
  g.airdrop.phase = "idle";
  until(g, "plane");
  assert(Math.abs(g.time - started - DATA.schedule.intervalSeconds) < 0.1);
});

test("a landing spot is never on or beside an exit, and no spot means a retry", () => {
  const g = game({ exits: (p) => (p.x > 0 ? { areaId: "x" } : null) });
  for (let i = 0; i < 20; i++) {
    const spot = pickLanding(g);
    if (spot) assert(spot.x < 0 && spot.x < -DATA.landing.exitClearance);
  }
  const blocked = game({ clear: () => false });
  assert.equal(pickLanding(blocked), null);
  run(blocked, DATA.schedule.firstDelayMax + 1);
  assert.equal(blocked.airdrop.phase, "idle");
  assert(blocked.airdrop.nextAt <= blocked.time + DATA.schedule.retrySeconds);
});

test("the crate lands where a living boss can walk to it in a straight line, when such a spot exists", () => {
  const g = game();
  g.enemies = [{ bossProfile: {}, hp: 5, pos: { x: 500, z: 0 } }, { bossProfile: {}, hp: 0, pos: { x: -500, z: 0 } }];
  g.world.lineClear = (a, b) => a.x !== 500 || b.x > 0;
  for (let i = 0; i < 20; i++) assert(pickLanding(g).x > 0);
  g.world.lineClear = (a) => a.x !== 500;
  assert(pickLanding(g), "with no such spot the player's own reachable spot is used");
});

test("holding beside the landed crate opens it: bundle applied once, bonus golden-weapon is a no-op until registered", () => {
  const g = game();
  until(g, "landed");
  g.player.pos = { ...g.airdrop.crate };
  run(g, DATA.crate.holdSeconds / 2);
  assert.match(g.airdrop.hud, /^OPENING AIRDROP · \d+%$/);
  run(g, DATA.crate.holdSeconds);
  assert.equal(g.airdrop.phase, "idle");
  assert.equal(g.player.hp, g.player.maxHP);
  assert.equal(g.marked.carried, 150);
  assert.match(g.message, /^Airdrop opened\. .*\$150 found\.$/);
  assert.doesNotMatch(g.message, /golden/);
});

test("a registered golden-weapon outcome is applied when the bonus roll lands on it", () => {
  const granted = [];
  registerAirdropOutcome("golden-weapon", (g, row) => granted.push(row.id) > 0);
  const g = game();
  g.random = (() => {
    let n = 0;
    return () => (n++ < 20 ? 0.4 : 0);
  })();
  until(g, "landed");
  g.random = () => 0;
  g.player.pos = { ...g.airdrop.crate };
  run(g, DATA.crate.holdSeconds + 1);
  assert.deepEqual(granted, ["golden-weapon"]);
  assert.match(g.message, /golden weapon was inside/);
  registerAirdropOutcome("golden-weapon", () => false);
});

test("walking away lets the hold fade, and an unopened crate is lost after its lifetime", () => {
  const g = game();
  until(g, "landed");
  g.player.pos = { ...g.airdrop.crate };
  run(g, 1);
  const held = g.airdrop.hold;
  assert(held > 0);
  g.player.pos = { x: g.airdrop.crate.x + 50, z: g.airdrop.crate.z };
  run(g, 0.2);
  assert(g.airdrop.hold < held);
  run(g, DATA.crate.lifetimeSeconds);
  assert.equal(g.airdrop.phase, "idle");
  assert.equal(g.message, GAME_DATA.webText.texts["airdrop.lost"]);
});

test("a new area starts a fresh clock and drops the old crate", () => {
  const g = game();
  until(g, "landed");
  g.world.areaId = "south";
  run(g, STEP);
  assert.equal(g.airdrop.phase, "idle");
  assert.equal(g.airdrop.areaId, "south");
});

test("bosses walk to a falling or landed crate unless they are already fighting the player", () => {
  const g = game();
  const boss = { id: "b", bossProfile: { wakeDistance: 8 }, hp: 10, pos: { x: 60, z: 0 }, moveSpeed: 2, alerted: true, returning: true };
  const calls = [];
  const move = (_g, e, dir, speed, dt) => calls.push({ dir, speed, dt, alerted: e.alerted });
  assert.equal(airdropPull(g, boss, STEP, move), false, "no airdrop yet");
  until(g, "falling");
  g.airdrop.crate = { x: 20, z: 0 };
  assert.equal(airdropPull(g, boss, STEP, move), true);
  assert.deepEqual(calls[0], { dir: { x: -1, z: 0 }, speed: 2, dt: STEP, alerted: false });
  assert.equal(boss.alerted, false);
  assert.equal(airdropPull(g, { ...boss, bossProfile: undefined }, STEP, move), false, "ordinary enemies ignore it");
  assert.equal(airdropPull(g, { ...boss, hp: 0 }, STEP, move), false);
  g.player.pos = { x: 55, z: 0 };
  assert.equal(airdropPull(g, boss, STEP, move), false, "a boss close enough to wake keeps to the player");
  g.player.pos = { x: 60 - DATA.convergence.engageRadius + 1, z: 0 };
  assert.equal(airdropPull(g, { ...boss, alerted: true }, STEP, move), false, "a boss chasing the player keeps chasing");
  g.player.pos = { x: 60 - DATA.convergence.engageRadius - 1, z: 0 };
  assert.equal(airdropPull(g, { ...boss, alerted: true }, STEP, move), true, "unless the player has got well away");
  g.player.pos = { x: 0, z: 0 };
  boss.pos = { x: 20 + DATA.convergence.arriveRadius - 0.1, z: 0 };
  const before = calls.length;
  assert.equal(airdropPull(g, boss, STEP, move), true);
  assert.equal(calls.length, before, "a boss at the crate waits there");
});

test("a boss's home leash stretches to cover the crate while it lies there, and comes back after", () => {
  const g = game(),
    intent = Object.freeze({ homeLeash: 18, wakeDistance: 8 }),
    boss = { bossProfile: { wakeDistance: 8 }, hp: 10, home: { x: 0, z: 0 }, pos: { x: 0, z: 0 }, moveSpeed: 1, residentIntent: intent };
  until(g, "falling");
  g.airdrop.crate = { x: 40, z: 0 };
  g.player.pos = { x: 100, z: 0 };
  airdropPull(g, boss, STEP, () => {});
  assert.equal(boss.residentIntent.homeLeash, 40 + DATA.convergence.leashPadding);
  assert.equal(boss.residentIntent.wakeDistance, 8);
  assert.equal(intent.homeLeash, 18, "the boss's own row is untouched");
  g.airdrop.phase = "idle";
  assert.equal(airdropPull(g, boss, STEP, () => {}), false);
  assert.equal(boss.residentIntent, intent);
});

test("the effect adapters heal and pay as the bundle names them", () => {
  const g = game();
  assert.equal(medkit(g, { fraction: 0.25 }), true);
  assert.equal(g.player.hp, 75);
  assert.equal(cash(g, { amount: 40 }), 40);
  assert.equal(g.marked.carried, 40);
});
