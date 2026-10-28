import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { make } from "./helpers/marked-fixture.js";
import { stepChainBreak, chainBreakState } from "../src/engine/chain-break.js";
import { GAME_DATA } from "../src/engine/game-data.js";
import { createPistolState, grantPistol, stepPistol } from "../src/pistol.js";

const D = GAME_DATA.chainedPitborn;
const B = D.breakLoose;
const T = D.chainedTargets;
const spawn = (p) => ({ id: 900, hp: 80, markedHunter: true, pos: { ...p }, radius: 0.4, hostile: true });
function steps() {
  const g = make().g;
  g.enemies = [];
  g.events = [];
  g.time = 10;
  g.world.areaId = D.areaId;
  const at = g.world.geometry.ground(D.at);
  g.player.pos = { x: at.x - 5, z: at.z };
  g.player.facing = { x: 1, z: 0 };
  return { g, at };
}
// Steps once with these events and returns the chain state.
function after(events) {
  const { g, at } = steps();
  g.events = typeof events === "function" ? events(g, at) : events;
  stepChainBreak(g, spawn, true);
  return chainBreakState(g).state;
}
const ray = (g, at, dz = 0) => ({ origin: { ...g.player.pos }, end: { x: at.x + 3, z: at.z + dz } });

test("every damage source in chainedTargets is emitted by the game, so the registry cannot drift from the code", () => {
  const files = [];
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).forEach((f) => {
      if (f.isDirectory()) walk(dir + "/" + f.name);
      else if (f.name.endsWith(".js")) files.push(dir + "/" + f.name);
    });
  walk(new URL("../src", import.meta.url).pathname);
  const code = files.filter((f) => !f.endsWith("chain-break.js")).map((f) => readFileSync(f, "utf8")).join("\n");
  for (const type of [...T.rays, ...T.rays3d, ...T.melee, ...T.blasts, ...T.cones])
    assert(code.includes(`"${type}"`), `no code emits ${type}`);
});

test("rays: a pistol or rifle shot, a shotgun pellet and an arc-gun bolt break the chains; a miss or another actor's shot does not", () => {
  assert.equal(after((g, at) => [{ type: "shot", ...ray(g, at) }]), "snapping", "pistol / rifle shot");
  assert.equal(after((g, at) => [{ type: "shot", ...ray(g, at, 7), pellets: [ray(g, at, 7), ray(g, at, 0.3)] }]), "snapping", "one shotgun pellet");
  assert.equal(after((g, at) => [{ type: "shot", ...ray(g, at, 7), pellets: [ray(g, at, 7)] }]), "chained", "every pellet wide");
  const flip = (q) => ({ x: q.x, z: -q.z });
  assert.equal(
    after((g, at) => [{ type: "railgun-shot", actor: g.player, origin: flip(ray(g, at).origin), end: flip(ray(g, at).end) }]),
    "snapping",
    "arc gun (3D points, z negated)",
  );
  assert.equal(after((g, at) => [{ type: "shot", ...ray(g, at, 7) }]), "chained", "shot wide");
  assert.equal(after((g, at) => [{ type: "shot", actor: { id: 5 }, ...ray(g, at) }]), "chained", "another actor's shot");
});

test("a REAL shot from the game's own pistol code (stepPistol, not a hand-built event) snaps the chains", () => {
  const { g, at } = steps();
  const start = grantPistol(createPistolState({ pickupPos: at })).state;
  const out = stepPistol(start, {
    time: g.time,
    fire: true,
    origin: { ...g.player.pos },
    aim: { x: at.x - g.player.pos.x, z: at.z - g.player.pos.z },
    targets: [],
    lineClear: () => true,
  });
  assert(out.events.some((e) => e.type === "shot"), "the pistol fired");
  g.events = out.events;
  stepChainBreak(g, spawn, true);
  assert.equal(chainBreakState(g).state, "snapping");
});

test("melee: a swing and the bone saw break the chains in reach and in front, not behind", () => {
  for (const type of T.melee) {
    assert.equal(
      after((g, at) => {
        g.player.pos = { x: at.x - 1.5, z: at.z };
        return [{ type, actor: g.player }];
      }),
      "snapping",
      type,
    );
    assert.equal(
      after((g, at) => {
        g.player.pos = { x: at.x - 1.5, z: at.z };
        g.player.facing = { x: -1, z: 0 };
        return [{ type, actor: g.player }];
      }),
      "chained",
      type + " swung away",
    );
  }
});

test("blasts: a grenade, a rocket and a trap crate break the chains inside radius plus padding, whoever set them off", () => {
  for (const type of T.blasts) {
    const blast = (offset) => (g, at) => [{ type, position: { x: at.x + offset, z: at.z }, radius: 3 }];
    assert.equal(after(blast(3.5)), "snapping", type + " inside the padded radius");
    assert.equal(after(blast(3 + T.blastPaddingMetres + 1)), "chained", type + " too far");
  }
});

test("flame: the ember projector's cone breaks the chains in range and aimed at it, not out of range or turned away", () => {
  const cone = (g, at, over = {}) => ({
    type: "flame-contact",
    actor: g.player,
    origin: { x: at.x - 3, z: at.z },
    direction: { x: 1, z: 0 },
    range: 5,
    coneDegrees: 40,
    ...over,
  });
  assert.equal(after((g, at) => [cone(g, at)]), "snapping", "in range, aimed at it");
  assert.equal(after((g, at) => [cone(g, at, { range: 1 })]), "chained", "out of range");
  assert.equal(after((g, at) => [cone(g, at, { direction: { x: -1, z: 0 } })]), "chained", "turned away");
  assert.equal(after((g, at) => [cone(g, at, { direction: { x: 0, z: 1 } })]), "chained", "aimed sideways");
});

test("any source is still blocked by the site gates, like any hunter", () => {
  const { g, at } = steps();
  g.events = [{ type: "grenade-blast", position: { ...at }, radius: 3 }];
  stepChainBreak(g, spawn, false);
  assert.equal(chainBreakState(g).state, "chained");
  assert.equal(B.enabled, true);
});
