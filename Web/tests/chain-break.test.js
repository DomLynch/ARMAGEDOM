import test from "node:test";
import assert from "node:assert/strict";
import { make } from "./helpers/marked-fixture.js";
import { stepChainBreak, chainBreakState } from "../src/engine/chain-break.js";
import { stepMarkedHunters, clearMarkedHunters } from "../src/engine/marked-hunters.js";
import { GAME_DATA } from "../src/engine/game-data.js";

const B = GAME_DATA.chainedPitborn.breakLoose;
const spawn = (p) => ({ id: 900, hp: 80, markedHunter: true, pos: { ...p }, radius: 0.4, hostile: true });
function steps() {
  const g = make().g;
  g.enemies = [];
  g.events = [];
  g.time = 10;
  g.world.areaId = GAME_DATA.chainedPitborn.areaId;
  return { g, at: g.world.geometry.ground(GAME_DATA.chainedPitborn.at) };
}
// A shot from the player's position along +x that ends 4 m past the Pitborn's x, dz metres off its line.
const shot = (g, at, dz = 0) => ({ type: "shot", origin: { ...g.player.pos }, end: { x: at.x + 4, z: at.z + dz }, direction: { x: 1, z: 0 } });
// Fires at the Pitborn and steps once; returns the chain state.
function fireAt(g, at, open = true, dz = 0) {
  g.player.pos = { x: at.x - 8, z: at.z };
  g.events = [shot(g, at, dz)];
  stepChainBreak(g, spawn, open);
  return chainBreakState(g).state;
}
function snapAndLoose(g, at) {
  assert.equal(fireAt(g, at), "snapping");
  g.events = [];
  g.time += B.snapSeconds + 0.01;
  stepChainBreak(g, spawn, true);
}

test("walking up to the shackled Pitborn does nothing: only a hit breaks the chains", () => {
  const { g, at } = steps();
  for (const gapMetres of [8, 2, 0]) {
    g.player.pos = { x: at.x + gapMetres, z: at.z };
    stepChainBreak(g, spawn, true);
    assert.equal(chainBreakState(g).state, "chained");
  }
  assert.equal(g.enemies.length, 0);
});

test("a shot at it snaps the chains, then a marked hunter stands at a clear spot near where it was", () => {
  const { g, at } = steps();
  assert.equal(fireAt(g, at), "snapping");
  assert.equal(g.message, B.text.snap);
  assert.equal(g.enemies.length, 0);
  g.events = [];
  g.time += B.snapSeconds + 0.01;
  stepChainBreak(g, spawn, true);
  assert.equal(chainBreakState(g).state, "loose");
  assert.equal(g.enemies.length, 1);
  assert.equal(g.enemies[0].markedHunter, true);
  const [hunter] = g.enemies;
  assert(Math.hypot(hunter.pos.x - at.x, hunter.pos.z - at.z) <= B.clearSearchMetres);
  assert(g.world.geometry.clear(hunter.pos, 0.4), "a 0.4 m body does not clip scenery");
  assert.equal(g.message, B.text.loose);
  stepChainBreak(g, spawn, true);
  assert.equal(g.enemies.length, 1, "it breaks loose once");
});

test("a shot past it misses, and a closed gate (safehouse, invalid save, finished run) shows nothing", () => {
  const { g, at } = steps();
  assert.equal(fireAt(g, at, true, 6), "chained", "a shot 6 m off its line misses");
  assert.equal(fireAt(g, at, false), "chained", "a closed gate shows nothing");
  assert.equal(fireAt(g, at, true, 0.5), "snapping", "a shot within its body radius hits");
});

test("a knife swing at it snaps the chains, one aimed away or out of reach does not", () => {
  const { g, at } = steps();
  g.events = [{ type: "attack", actor: g.player }];
  g.player.pos = { x: at.x - 1.5, z: at.z };
  g.player.facing = { x: -1, z: 0 };
  stepChainBreak(g, spawn, true);
  assert.equal(chainBreakState(g).state, "chained", "swung away from it");
  g.player.pos = { x: at.x - B.meleeReachMetres - 2, z: at.z };
  g.player.facing = { x: 1, z: 0 };
  stepChainBreak(g, spawn, true);
  assert.equal(chainBreakState(g).state, "chained", "out of reach");
  g.player.pos = { x: at.x - 1.5, z: at.z };
  stepChainBreak(g, spawn, true);
  assert.equal(chainBreakState(g).state, "snapping");
});

test("a blocked spawn point moves to the nearest clear spot, and waits when there is none", () => {
  const { g, at } = steps();
  const real = g.world.geometry.clear;
  assert.equal(fireAt(g, at), "snapping");
  g.events = [];
  g.time += B.snapSeconds + 0.01;
  g.world.geometry.clear = (p, r) => Math.hypot(p.x - at.x, p.z - at.z) >= 1 && real(p, r);
  stepChainBreak(g, spawn, true);
  const moved = Math.hypot(g.enemies[0].pos.x - at.x, g.enemies[0].pos.z - at.z);
  assert(moved >= 1 && moved <= 1.3, "one ring step past the blocked radius, not further");
  const none = steps();
  assert.equal(fireAt(none.g, none.at), "snapping");
  none.g.events = [];
  none.g.time += B.snapSeconds + 0.01;
  none.g.world.geometry.clear = () => false;
  stepChainBreak(none.g, spawn, true);
  assert.equal(none.g.enemies.length, 0);
  assert.equal(chainBreakState(none.g).state, "snapping");
});

test("killing it ends the set-piece for the run; leaving puts it back in its chains", () => {
  const killed = steps();
  snapAndLoose(killed.g, killed.at);
  const actor = chainBreakState(killed.g).actor;
  killed.g.enemies = [];
  actor.hp = 0;
  stepChainBreak(killed.g, spawn, true);
  assert.equal(chainBreakState(killed.g).state, "done");
  const left = steps();
  snapAndLoose(left.g, left.at);
  left.g.enemies = [];
  stepChainBreak(left.g, spawn, true);
  assert.equal(chainBreakState(left.g).state, "chained");
});

test("it never spawns a second hunter while another lives", () => {
  const { g, at } = steps();
  assert.equal(fireAt(g, at), "snapping");
  g.events = [];
  g.enemies = [spawn({ x: 1, z: 1 })];
  g.time += B.snapSeconds + 0.01;
  stepChainBreak(g, spawn, true);
  assert.equal(g.enemies.length, 1);
  assert.equal(chainBreakState(g).state, "snapping");
});

test("through the hunter step: a hit works for a new player (no bounty, inside the arrival wait), an invalid run save blocks it", () => {
  const { g, at } = steps();
  g.marked = { version: 1, carried: 0, bank: 0, bounty: 0 };
  g.time = 0;
  clearMarkedHunters(g);
  g.player.pos = { x: at.x - 8, z: at.z };
  g.runSaveInvalid = true;
  g.events = [shot(g, at)];
  stepMarkedHunters(g, spawn);
  assert.equal(chainBreakState(g).state, "chained", "an invalid run save blocks it like a hunter");
  g.runSaveInvalid = false;
  g.events = [shot(g, at)];
  stepMarkedHunters(g, spawn);
  assert.equal(chainBreakState(g).state, "snapping", "no bounty and no arrival wait for a hit");
  g.player.hp = 0;
  g.events = [];
  stepMarkedHunters(g, spawn);
  g.player.hp = 150;
  g.time += 1;
  stepMarkedHunters(g, spawn);
  assert.equal(chainBreakState(g).state, "chained", "death puts it back in its chains");
});
