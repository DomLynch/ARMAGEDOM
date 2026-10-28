import test from "node:test";
import assert from "node:assert/strict";
import { make, collectPistol } from "./helpers/marked-fixture.js";
import { stepChainBreak, chainBreakState } from "../src/engine/chain-break.js";
import { resolveRangedAim } from "../src/pistol-targeting.js";
import { GAME_DATA } from "../src/engine/game-data.js";

// Dom, 28 Oct: on the phone the pistol did nothing to the chained Pitborn and auto-aim ignored it. The lion statue's collision stops the
// bullet 1 to 4 m short of the prop, so the shot never came within hit range of it.
const spawn = (p) => ({ id: 900, hp: 80, markedHunter: true, pos: { ...p }, radius: 0.4, hostile: true });
function armed() {
  const f = make();
  collectPistol(f);
  const g = f.g;
  g.enemies = [];
  g.events = [];
  g.time = 10;
  g.pistol.equipped = true;
  return { g, at: g.world.geometry.ground(GAME_DATA.chainedPitborn.at) };
}
// A spot on the open ground around the Pitborn whose straight line to it is blocked by scenery.
function covered(g, at) {
  const w = g.world;
  for (const d of [3, 5, 8])
    for (const a of [0.7, 2.1, -0.7, 1.57, 0]) {
      const o = { x: at.x + Math.cos(a) * d, z: at.z + Math.sin(a) * d };
      if (w.lineClear(o, o) && !w.lineClear(o, at)) return o;
    }
  throw Error("no covered spot");
}
function fire(g, at, from, offDegrees) {
  g.player.pos = from;
  const base = Math.atan2(at.z - from.z, at.x - from.x) + (offDegrees * Math.PI) / 180,
    aim = { x: Math.cos(base), z: Math.sin(base) },
    shot = resolveRangedAim(g, aim)?.trace;
  assert(shot, "the pistol fires");
  g.events = [{ type: "shot", ...shot }];
  stepChainBreak(g, spawn, true);
  return { state: chainBreakState(g).state, shot };
}

test("a pistol shot aimed at the Pitborn behind the statue frees it", () => {
  const { g, at } = armed();
  const { state, shot } = fire(g, at, covered(g, at), 0);
  assert(Math.hypot(shot.end.x - at.x, shot.end.z - at.z) > GAME_DATA.chainedPitborn.breakLoose.hitRadiusMetres, "the statue stops the bullet short");
  assert.equal(state, "snapping");
});

test("auto-aim pulls a shot a few degrees off the Pitborn onto it, and frees it", () => {
  const { g, at } = armed();
  const from = covered(g, at);
  const { state, shot } = fire(g, at, from, 8);
  const want = Math.atan2(at.z - from.z, at.x - from.x);
  assert(Math.abs(Math.atan2(shot.direction.z, shot.direction.x) - want) < 0.01, "the shot is turned toward it");
  assert.equal(state, "snapping");
});

test("a shot well off the Pitborn, or into a far wall, leaves it chained", () => {
  const { g, at } = armed();
  const from = covered(g, at);
  assert.equal(fire(g, at, from, 60).state, "chained");
  g.chainBreak = undefined;
  g.player.pos = { x: at.x + 40, z: at.z };
  g.events = [{ type: "shot", origin: { ...g.player.pos }, end: { x: at.x + 30, z: at.z }, direction: { x: -1, z: 0 } }];
  stepChainBreak(g, spawn, true);
  assert.equal(chainBreakState(g).state, "chained", "blocked far away, not by its own cover");
});

test("once it is loose it is no longer a stand-in target", () => {
  const { g, at } = armed();
  const from = covered(g, at);
  fire(g, at, from, 0);
  g.events = [];
  g.time += 2;
  stepChainBreak(g, spawn, true);
  assert.equal(chainBreakState(g).state, "loose");
  g.enemies = [];
  g.player.pos = from;
  const base = Math.atan2(at.z - from.z, at.x - from.x) + 0.14,
    aim = { x: Math.cos(base), z: Math.sin(base) },
    shot = resolveRangedAim(g, aim)?.trace;
  assert(Math.abs(shot.direction.x - aim.x) < 1e-9 && Math.abs(shot.direction.z - aim.z) < 1e-9, "the aim is left as the player held it");
});
