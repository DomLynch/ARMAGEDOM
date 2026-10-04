import test from "node:test";
import assert from "node:assert/strict";
import { createGame, enemy, stepGame } from "../src/combat.js";
import { travelTo } from "../src/travel.js";
const world = () => ({
  areaId: "westminster",
  spawn: { x: 0, z: -6 },
  move: (p, d) => ({ x: p.x + d.x, z: p.z + d.z }),
  lineClear: () => true,
  async loadArea(id) {
    this.areaId = id;
    return { x: 9, z: 2 };
  },
});
test("leaving Westminster parks the existing fight and returning retains its health and wave", async () => {
  const w = world(),
    g = createGame(w);
  g.wave = 1;
  g.enemies = [enemy(1, { x: 1, z: 1 })];
  g.enemies[0].hp = 61;
  g.player.hp = 73;
  await travelTo(g, { areaId: "east", entryPoint: { x: 0.1, y: 0.72 } });
  assert.equal(g.enemies.length, 0);
  stepGame(g, { move: { x: 1, z: 0 } }, 1);
  assert.equal(g.wave, 1);
  assert.equal(g.player.hp, 73);
  await travelTo(g, { areaId: "westminster", entryPoint: { x: 0.9, y: 0.4 } });
  assert.equal(g.enemies[0].hp, 61);
  assert.equal(g.enemies[0].kind, 1);
  assert.equal(g.wave, 1);
  assert.equal(g.player.hp, 73);
});
test("failed destination load leaves the prior fight and player intact", async () => {
  const w = world(),
    g = createGame(w),
    e = enemy(0, { x: 0, z: -4 });
  g.enemies = [e];
  w.loadArea = async () => {
    throw Error("HTTP503");
  };
  await assert.rejects(travelTo(g, { areaId: "south" }), /503/);
  assert.deepEqual(g.player.pos, { x: 0, z: -6 });
  assert.equal(g.enemies[0], e);
  assert.notEqual(g.encounterActive, false);
});
test("while exploring a side area movement and six actions work without inventing enemy waves", async () => {
  const w = world(),
    g = createGame(w);
  g.started = true;
  await travelTo(g, { areaId: "south" });
  stepGame(g, { actions: ["heavy"] }, 3);
  assert.equal(g.wave, 0);
  assert.equal(g.enemies.length, 0);
  assert.equal(g.player.swing.action, "heavy");
});
test("donor crossing clears an in-flight roll and parks corpses with their encounter", async () => {
  const w = world(),
    g = createGame(w, { pilot: "donor-knife" });
  g.corpses = [{ id: 3, hp: 0, pos: { x: 1, z: 1 } }];
  g.player.dodgeUntil = 10;
  g.player.invulnerableUntil = 10;
  g.player.dodgeDirection = { x: 1, z: 0 };
  await travelTo(g, { areaId: "east", entryPoint: { x: 0.1, y: 0.72 } });
  assert.equal(g.corpses.length, 0);
  assert.equal(g.player.dodgeUntil, g.time);
  assert.equal(g.player.invulnerableUntil, g.time);
  await travelTo(g, { areaId: "westminster" });
  assert.equal(g.corpses[0].id, 3);
});
test("continuing a won encounter preserves HP/stamina and never respawns it on return", async () => {
  const { continueExploring } = await import("../src/travel.js");
  const w = world(),
    g = createGame(w, { pilot: "donor-knife" });
  g.started = true;
  g.wave = 1;
  g.finished = g.won = true;
  g.player.hp = 41;
  g.player.stamina = 37;
  g.player.guard = 37;
  assert.equal(continueExploring(g), true);
  assert.equal(g.finished, false);
  assert.equal(g.encounterCleared, true);
  assert.equal(g.encounterActive, false);
  stepGame(g, { move: { x: 1, z: 0 } }, 1 / 60);
  assert.equal(g.player.hp, 41);
  assert.equal(g.enemies.length, 0);
  assert.equal(g.wave, 1);
  await travelTo(g, { areaId: "south" });
  await travelTo(g, { areaId: "westminster" });
  stepGame(g, { actions: ["slash"] }, 1 / 60);
  assert.equal(g.encounterActive, false);
  assert.equal(g.enemies.length, 0);
  assert.equal(g.player.hp, 41);
});
test("dead or uncleared encounter cannot be dismissed as explored", async () => {
  const { continueExploring } = await import("../src/travel.js");
  const g = createGame(world());
  assert.equal(continueExploring(g), false);
  g.finished = true;
  g.player.hp = 0;
  assert.equal(continueExploring(g), false);
  assert.equal(g.finished, true);
});
