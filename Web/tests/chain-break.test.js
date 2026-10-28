import test from "node:test";
import assert from "node:assert/strict";
import { make } from "./helpers/marked-fixture.js";
import { stepChainBreak, chainBreakState } from "../src/engine/chain-break.js";
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
  stepChainBreak(g, spawn);
  assert.equal(chainBreakState(g).state, "chained");
  assert.equal(g.enemies.length, 0);
});

test("walking up snaps the chains, then a marked hunter stands where the Pitborn was", () => {
  const { g, at } = steps();
  g.player.pos = { x: at.x + 2, z: at.z };
  stepChainBreak(g, spawn);
  assert.equal(chainBreakState(g).state, "snapping");
  assert.equal(g.message, B.text.snap);
  assert.equal(g.enemies.length, 0);
  g.time += B.snapSeconds + 0.01;
  stepChainBreak(g, spawn);
  assert.equal(chainBreakState(g).state, "loose");
  assert.equal(g.enemies.length, 1);
  assert.equal(g.enemies[0].markedHunter, true);
  assert.deepEqual(g.enemies[0].pos, { ...at });
  assert.equal(g.message, B.text.loose);
  stepChainBreak(g, spawn);
  assert.equal(g.enemies.length, 1, "it breaks loose once");
});

test("killing it ends the set-piece for the run; death puts it back in its chains", () => {
  const killed = steps();
  killed.g.player.pos = { ...killed.at };
  stepChainBreak(killed.g, spawn);
  killed.g.time += B.snapSeconds + 0.01;
  stepChainBreak(killed.g, spawn);
  killed.g.enemies = [];
  killed.g.corpses = [killed.g.corpses ?? []].flat();
  chainBreakState(killed.g).actor.hp = 0;
  stepChainBreak(killed.g, spawn);
  assert.equal(chainBreakState(killed.g).state, "done");
  const died = steps();
  died.g.player.pos = { ...died.at };
  stepChainBreak(died.g, spawn);
  died.g.player.hp = 0;
  stepChainBreak(died.g, spawn);
  assert.equal(chainBreakState(died.g).state, "chained");
});

test("it never spawns a second hunter while another lives", () => {
  const { g, at } = steps();
  g.player.pos = { ...at };
  stepChainBreak(g, spawn);
  g.enemies = [spawn({ x: 1, z: 1 })];
  g.time += B.snapSeconds + 0.01;
  stepChainBreak(g, spawn);
  assert.equal(g.enemies.length, 1);
  assert.equal(chainBreakState(g).state, "snapping");
});
