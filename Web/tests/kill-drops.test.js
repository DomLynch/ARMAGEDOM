import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateKillDrops } from "../src/engine/game-data-kill-drops.js";
import { KILL_DROPS, leaveKillDrops, rollKillCash, stepKillDrops, tierOf } from "../src/engine/kill-drops.js";

const ON = { ...KILL_DROPS, enabled: true };
const run = (over = {}) => ({
  time: 10,
  kills: 1,
  events: [],
  finished: false,
  world: { areaId: "east", markedData: { maxMoney: 1000 } },
  marked: { carried: 0, bank: 0 },
  player: { hp: 10, pos: { x: 0, z: 0 } },
  ...over,
});
const die = (g, actor) => g.events.push({ type: "death", actor: { pos: { x: 5, z: 5 }, ...actor } });

test("kill drops ship switched off and the data is valid", () => {
  assert.equal(GAME_DATA.killDrops.enabled, false);
  validateKillDrops(structuredClone(KILL_DROPS));
  const g = run();
  die(g, { rig: "original-rat" });
  assert.equal(leaveKillDrops(g), 0);
  assert.equal(g.killDrops, undefined);
});
test("tiers: boss profile is boss, a salamander a creature, a rat and an unknown body trash", () => {
  assert.equal(tierOf({ bossProfile: {} }), "boss");
  assert.equal(tierOf({ rig: "giant-salamander" }), "creature");
  assert.equal(tierOf({ rig: "original-rat" }), "trash");
  assert.equal(tierOf({ rig: "hero" }), "trash");
});
test("each tier rolls inside its range and the roll repeats", () => {
  for (const [tier, row] of Object.entries(KILL_DROPS.tiers)) {
    const seen = new Set();
    for (let k = 0; k < 200; k++) {
      const n = rollKillCash({ kills: k, time: k }, tier, "x", ON);
      assert.ok(Number.isInteger(n) && n >= row.min && n <= row.max, `${tier} ${n}`);
      seen.add(n);
    }
    assert.ok(seen.size > 3, `${tier} varies`);
    assert.equal(rollKillCash({ kills: 4, time: 2 }, tier, "x", ON), rollKillCash({ kills: 4, time: 2 }, tier, "x", ON));
  }
});
test("a death leaves a drop, walking onto it pays once and notes one claim with its source", () => {
  const g = run();
  die(g, { rig: "giant-salamander" });
  assert.equal(leaveKillDrops(g, ON), 1);
  stepKillDrops(g, ON);
  assert.equal(g.killDrops.list.length, 1, "out of reach stays");
  g.player.pos = { x: 5, z: 5 };
  stepKillDrops(g, ON);
  const claim = g.cashClaims.at(0);
  assert.equal(g.killDrops.list.length, 0);
  assert.equal(claim.source, "kill:creature");
  assert.ok(claim.amount >= 11 && claim.amount <= 20);
  assert.equal(g.marked.carried, claim.amount);
  assert.match(g.message, /^\+\$\d+$/);
  stepKillDrops(g, ON);
  assert.equal(g.cashClaims.length, 1);
});
test("a boss pays $21-40 with the boss source; a marked hunter leaves nothing", () => {
  const g = run({ player: { hp: 10, pos: { x: 5, z: 5 } } });
  die(g, { bossProfile: {} });
  die(g, { markedHunter: true });
  assert.equal(leaveKillDrops(g, ON), 1);
  stepKillDrops(g, ON);
  assert.equal(g.cashClaims[0].source, "kill:boss");
  assert.ok(g.cashClaims[0].amount >= 21 && g.cashClaims[0].amount <= 40);
});
test("a full wallet leaves the coins and says so once", () => {
  const g = run({ marked: { carried: 1000, bank: 0 }, player: { hp: 10, pos: { x: 5, z: 5 } } });
  die(g, { rig: "original-rat" });
  leaveKillDrops(g, ON);
  stepKillDrops(g, ON);
  assert.equal(g.killDrops.list.length, 1);
  assert.equal(g.message, KILL_DROPS.text.full);
  assert.equal(g.cashClaims, undefined);
});
test("drops expire, vanish with the area and never exceed maxDrops", () => {
  const g = run();
  for (let i = 0; i < ON.maxDrops + 5; i++) die(g, { rig: "original-rat" });
  leaveKillDrops(g, ON);
  assert.equal(g.killDrops.list.length, ON.maxDrops);
  g.time += ON.despawnSeconds + 1;
  stepKillDrops(g, ON);
  assert.equal(g.killDrops.list.length, 0);
  die(g, { rig: "original-rat" });
  g.events = g.events.slice(-1);
  leaveKillDrops(g, ON);
  g.world = { ...g.world, areaId: "south" };
  stepKillDrops(g, ON);
  assert.equal(g.killDrops.list.length, 0);
});
test("the validator rejects overlapping tiers and a wrong source", () => {
  const bad = structuredClone(KILL_DROPS);
  bad.tiers.creature.min = 5;
  assert.throws(() => validateKillDrops(bad), /overlap/);
  const bad2 = structuredClone(KILL_DROPS);
  bad2.tiers.boss.source = "kill:creature";
  assert.throws(() => validateKillDrops(bad2), /source/);
});
