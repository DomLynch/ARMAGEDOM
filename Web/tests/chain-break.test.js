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
  g.time = 10;
  g.world.areaId = GAME_DATA.chainedPitborn.areaId;
  return { g, at: g.world.geometry.ground(GAME_DATA.chainedPitborn.at) };
}

test("the chained Pitborn stays chained until the player walks up to it", () => {
  const { g, at } = steps();
  g.player.pos = { x: at.x + B.triggerMetres + 3, z: at.z };
  stepChainBreak(g, spawn, true);
  assert.equal(chainBreakState(g).state, "chained");
  assert.equal(g.enemies.length, 0);
});

test("walking up snaps the chains, then a marked hunter stands at a clear spot near where the Pitborn was", () => {
  const { g, at } = steps();
  g.player.pos = { x: at.x + 2, z: at.z };
  stepChainBreak(g, spawn, true);
  assert.equal(chainBreakState(g).state, "snapping");
  assert.equal(g.message, B.text.snap);
  assert.equal(g.enemies.length, 0);
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

test("a blocked spawn point moves to the nearest clear spot, and waits when there is none", () => {
  const { g, at } = steps();
  const real = g.world.geometry.clear;
  g.player.pos = { ...at };
  stepChainBreak(g, spawn, true);
  g.time += B.snapSeconds + 0.01;
  g.world.geometry.clear = (p, r) => Math.hypot(p.x - at.x, p.z - at.z) >= 1 && real(p, r);
  stepChainBreak(g, spawn, true);
  const moved = Math.hypot(g.enemies[0].pos.x - at.x, g.enemies[0].pos.z - at.z);
  assert(moved >= 1 && moved <= 1.3, "one ring step past the blocked radius, not further");
  const none = steps();
  none.g.player.pos = { ...none.at };
  stepChainBreak(none.g, spawn, true);
  none.g.time += B.snapSeconds + 0.01;
  none.g.world.geometry.clear = () => false;
  stepChainBreak(none.g, spawn, true);
  assert.equal(none.g.enemies.length, 0);
  assert.equal(chainBreakState(none.g).state, "snapping");
});

test("killing it ends the set-piece for the run; leaving puts it back in its chains", () => {
  const killed = steps();
  killed.g.player.pos = { ...killed.at };
  stepChainBreak(killed.g, spawn, true);
  killed.g.time += B.snapSeconds + 0.01;
  stepChainBreak(killed.g, spawn, true);
  const actor = chainBreakState(killed.g).actor;
  killed.g.enemies = [];
  actor.hp = 0;
  stepChainBreak(killed.g, spawn, true);
  assert.equal(chainBreakState(killed.g).state, "done");
  const left = steps();
  left.g.player.pos = { ...left.at };
  stepChainBreak(left.g, spawn, true);
  left.g.time += B.snapSeconds + 0.01;
  stepChainBreak(left.g, spawn, true);
  left.g.enemies = [];
  stepChainBreak(left.g, spawn, true);
  assert.equal(chainBreakState(left.g).state, "chained");
});

test("it never spawns a second hunter while another lives", () => {
  const { g, at } = steps();
  g.player.pos = { ...at };
  stepChainBreak(g, spawn, true);
  g.enemies = [spawn({ x: 1, z: 1 })];
  g.time += B.snapSeconds + 0.01;
  stepChainBreak(g, spawn, true);
  assert.equal(g.enemies.length, 1);
  assert.equal(chainBreakState(g).state, "snapping");
});

test("held to the hunter gates and the first-arrival wait: no snap for a fresh or freshly dead character", () => {
  const { g, at } = steps();
  g.marked = { version: 1, carried: 0, bank: 0, bounty: 300 };
  g.player.pos = { ...at }; // standing on the Pitborn, as the tutorial end is 1.9 m away
  g.time = 0;
  clearMarkedHunters(g);
  const wait = g.world.markedData.arrivalDelay;
  g.time = wait - 1;
  stepMarkedHunters(g, spawn);
  assert.equal(chainBreakState(g).state, "chained", "inside the arrival wait");
  g.time = wait + 1;
  g.runSaveInvalid = true;
  stepMarkedHunters(g, spawn);
  assert.equal(chainBreakState(g).state, "chained", "an invalid run save blocks it like a hunter");
  g.runSaveInvalid = false;
  g.marked.bounty = 0;
  stepMarkedHunters(g, spawn);
  assert.equal(chainBreakState(g).state, "chained", "too little bounty blocks it like a hunter");
  g.marked.bounty = 300;
  stepMarkedHunters(g, spawn);
  assert.equal(chainBreakState(g).state, "snapping", "open gates let it snap");
  g.player.hp = 0;
  stepMarkedHunters(g, spawn);
  g.player.hp = 150;
  g.time += 1;
  stepMarkedHunters(g, spawn);
  assert.equal(chainBreakState(g).state, "chained", "death restarts the wait");
});
