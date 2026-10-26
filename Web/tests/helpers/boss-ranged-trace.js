import { stepBossRanged, stepBossRockets } from "../../src/engine/boss-ranged.js";

const round = (v) => {
  if (typeof v === "number") return Math.round(v * 1e9) / 1e9;
  if (Array.isArray(v)) return v.map(round);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) if (k !== "actor") out[k] = round(x);
    return out;
  }
  return v;
};

function arena({ rig, wallX = Infinity, wallFrom = 0, playerX = 4 }) {
  const e = {
    id: 7,
    rig,
    hp: 100,
    home: false,
    bossProfile: { attacks: { slash: { range: 1 } } },
    combatScale: 1,
    pos: { x: 0, y: 0, z: 0 },
    moveSpeed: 2,
    recoverUntil: 0,
    staggerUntil: 0,
    ready: 0,
    facing: { x: 0, z: 1 },
  };
  const g = {
    time: 0,
    tick: 0,
    events: [],
    enemies: [e],
    player: { id: 1, pos: { x: playerX, y: 0, z: 0 }, hp: 100, radius: 0.4 },
    // The wall only stands from wallFrom on, so the boss still sees the player at the start and shots meet it in flight.
    world: {
      areaId: "a",
      lineClear: (a, b) => !(g.time >= wallFrom && Math.min(a.x, b.x) < wallX && Math.max(a.x, b.x) >= wallX),
    },
  };
  return { g, e };
}

// Drives a boss through warning, release and (for rockets) flight, recording events, hits and rocket state.
function run({ rig, hitBy, wallX, wallFrom, playerX, muzzleY = 1.2, ticks = 90 }) {
  const { g, e } = arena({ rig, wallX, wallFrom, playerX });
  const received = [];
  const trace = (_g, from, to) => {
    if (hitBy === "player") return { enemy: g.player, position: { x: to.x, y: to.y, z: -to.z } };
    if (hitBy === "surface" && to.x > 2) return { enemy: null, position: { x: 2, y: to.y, z: -to.z } };
    return null;
  };
  const hooks = {
    patrol: () => false,
    move: () => {},
    receive: (_g, hit) => received.push(round(hit)),
    source: () => ({ x: 0.3, y: muzzleY, z: 0 }),
    trace,
  };
  const log = [];
  for (let t = 0; t < ticks; t++) {
    g.time = t / 60;
    g.tick = t;
    stepBossRanged(g, e, 1 / 60, hooks);
    if (rig === "boss-butcher") stepBossRockets(g, hooks);
    if (g.events.length) log.push(...g.events.splice(0).map(round));
  }
  return { log, received, rockets: round(g.bossRockets), blast: round(g.bossRocketBlast), ready: round(e.ready) };
}

export function bossRangedTrace() {
  return {
    shotgunPlayer: run({ rig: "boss-south-nightborn", hitBy: "player" }),
    shotgunMiss: run({ rig: "boss-south-nightborn", hitBy: "none" }),
    shotgunSurface: run({ rig: "boss-south-nightborn", hitBy: "surface" }),
    shotgunWall: run({ rig: "boss-south-nightborn", hitBy: "none", wallX: 2.5, wallFrom: 0.35 }),
    rocketRange: run({ rig: "boss-butcher", hitBy: "none", playerX: 4, ticks: 160 }),
    rocketNear: run({ rig: "boss-butcher", hitBy: "none", playerX: 1.4, ticks: 160 }),
    rocketGround: run({ rig: "boss-butcher", hitBy: "none", playerX: 6, muzzleY: 3, ticks: 160 }),
    rocketWall: run({ rig: "boss-butcher", hitBy: "none", playerX: 8, wallX: 5, wallFrom: 0.55, ticks: 160 }),
    rocketSurface: run({ rig: "boss-butcher", hitBy: "surface", playerX: 8, ticks: 160 }),
    rocketBlastHit: run({ rig: "boss-butcher", hitBy: "surface", playerX: 2.5, ticks: 160 }),
    rocketFar: run({ rig: "boss-butcher", hitBy: "none", playerX: 20, ticks: 200 }),
  };
}
