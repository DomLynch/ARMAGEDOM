import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { make, collectPistol } from "./helpers/marked-fixture.js";
import { stepChainBreak, chainBreakState, sightPastStatue } from "../src/engine/chain-break.js";
import { resolveRangedAim } from "../src/pistol-targeting.js";
import { GAME_DATA } from "../src/engine/game-data.js";

// Dom, 28 Oct: on the phone the pistol did nothing to the chained Pitborn and auto-aim ignored it. The lion statue's collision stops the
// bullet 1 to 4 m short of the prop, so the shot never came within hit range of it.
const spawn = (p) => ({ id: 900, hp: 80, markedHunter: true, pos: { ...p }, radius: 0.4, hostile: true });
function armed() {
  const f = make();
  collectPistol(f);
  const g = f.g;
  g.world.layout = JSON.parse(fs.readFileSync(new URL("../public/world/westminster/layout.json", import.meta.url))); // the real World keeps its layout; the fixture's stand-in does not
  g.enemies = [];
  g.events = [];
  g.time = 10;
  g.pistol.equipped = true;
  return { g, at: g.world.geometry.ground(GAME_DATA.chainedPitborn.at) };
}
// A spot on open ground whose line to the Pitborn is stopped by the statue itself (statue) or by some other wall first (not statue).
function spot(g, at, statue, accept = () => true) {
  const w = g.world;
  for (const d of [3, 4, 5, 6, 8, 10, 12])
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2,
        o = { x: at.x + Math.cos(a) * d, z: at.z + Math.sin(a) * d };
      if (w.lineClear(o, o) && !w.lineClear(o, at) && sightPastStatue(w, at, o) === statue && accept(o)) return o;
    }
  throw Error("no spot");
}
const covered = (g, at) => spot(g, at, true);
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

test("the cover statue is named in data, is a blocker of the Westminster layout, and the Pitborn's own spot is open ground (sandbags gone)", () => {
  const { g, at } = armed();
  const name = GAME_DATA.chainedPitborn.chainedTargets.coverBlocker;
  assert.equal(name, "Lion pedestal");
  assert(g.world.layout.blockers.some((b) => b.name === name), "the layout has that blocker");
  assert(!g.world.layout.blockers.some((b) => /sandbag/i.test(b.name)), "no sandbag blocker beside the statue");
  assert(g.world.geometry.clear(at, 0.4), "the Pitborn's spot is open ground");
});

test("start-area pistol shots: every sampled point whose line is stopped by the statue frees the Pitborn, and there are such points", () => {
  const { g, at } = armed();
  const w = g.world;
  let shots = 0;
  for (const d of [3, 4, 5, 6, 8, 10])
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2,
        o = { x: at.x + Math.cos(a) * d, z: at.z + Math.sin(a) * d };
      if (!w.lineClear(o, o) || w.lineClear(o, at) || !sightPastStatue(w, at, o)) continue;
      g.chainBreak = undefined;
      assert.equal(fire(g, at, o, 0).state, "snapping", "freed from " + JSON.stringify(o));
      shots++;
    }
  assert(shots > 10, "statue-covered firing points exist: " + shots);
});

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

test("a bullet stopped by a wall, crate or enemy 3 to 5 m short of the Pitborn does not free it", () => {
  const { g, at } = armed();
  const from = covered(g, at);
  g.player.pos = from;
  const len = Math.hypot(at.x - from.x, at.z - from.z),
    dir = { x: (at.x - from.x) / len, z: (at.z - from.z) / len };
  for (const short of [3, 4, 5]) {
    const end = { x: at.x - dir.x * short, z: at.z - dir.z * short };
    g.chainBreak = undefined;
    g.events = [{ type: "shot", origin: { ...from }, end, direction: dir }];
    stepChainBreak(g, spawn, true);
    assert.equal(chainBreakState(g).state, "chained", short + " m short, stopped by something else");
  }
});

test("a hunter in the cone keeps the aim when the Pitborn is behind a wall; the shotgun is never pulled toward it", () => {
  const { g, at } = armed();
  const toward = (a) => ({ x: Math.cos(a), z: Math.sin(a) });
  const hunterFrom = (o) =>
    [6, 4, 3, 2].map((d) => {
      const a = Math.atan2(at.z - o.z, at.x - o.x) + 0.14;
      return { x: o.x + Math.cos(a) * d, z: o.z + Math.sin(a) * d };
    }).find((p) => g.world.lineClear(o, p));
  const from = spot(g, at, false, hunterFrom),
    hunterAt = hunterFrom(from),
    base = Math.atan2(at.z - from.z, at.x - from.x);
  g.player.pos = from;
  g.enemies = [{ id: 77, hp: 80, pos: hunterAt, radius: 0.4, hostile: true, visible: true }];
  assert.equal(resolveRangedAim(g, toward(base)).targetId, 77, "walled Pitborn does not steal the shot");
  // Shotgun: aimed a little off the (statue-covered) Pitborn, the direction stays as held.
  const open = covered(g, at);
  g.enemies = [];
  g.player.pos = open;
  g.pistol.equipped = false;
  g.bossEquipment.shotgun = { ...g.bossEquipment.shotgun, selected: true, magazine: 3 };
  const held = toward(Math.atan2(at.z - open.z, at.x - open.x) + 0.1),
    aim = resolveRangedAim(g, held);
  assert.equal(aim.profile.field, "shotgun");
  assert(Math.abs(aim.trace.direction.x - held.x) < 1e-9 && Math.abs(aim.trace.direction.z - held.z) < 1e-9, "not steered at the Pitborn");
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
