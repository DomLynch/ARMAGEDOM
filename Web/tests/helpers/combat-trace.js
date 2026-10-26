import { createGame, enemy, attack, receiveHit, stepGame } from "../../src/combat.js";
import { fixture } from "./rifle-fixture.js";

// Deterministic traces of the combat simulation, recorded from the code BEFORE its tuning numbers moved into data
// (tests/fixtures/combat-trace-pre-data.json). The tuning migration of combat.js must reproduce them bit for bit.
const open = { move: (p, d) => ({ x: p.x + d.x, z: p.z + d.z }), lineClear: () => true };
const r = (v) => (typeof v === "number" ? v : v);
const point = (p) => (p ? [r(p.x), r(p.z)] : null);
const swing = (s) => (s ? [s.action ?? s.kind ?? null, r(s.start), r(s.end ?? 0), s.hitIds?.size ?? null] : null);

function player(g) {
  const p = g.player;
  return {
    pos: point(p.pos),
    facing: point(p.facing),
    hp: p.hp,
    guard: p.guard,
    stamina: p.stamina,
    swing: swing(p.swing),
    ready: p.ready,
    dodgeUntil: p.dodgeUntil,
    invulnerableUntil: p.invulnerableUntil,
    dodgeReady: p.dodgeReady,
    guardRecoverAt: p.guardRecoverAt,
    guardBrokenUntil: p.guardBrokenUntil,
    hurtUntil: p.hurtUntil,
    flashUntil: p.flashUntil,
    parryUntil: p.parryUntil,
    guarding: p.guarding,
    exhausted: p.exhausted ?? null,
    response: p.response ? [p.response.clip, p.response.start, p.response.ticks] : null,
    buffer: p.buffer ? [p.buffer.action, p.buffer.until] : null,
  };
}
function enemies(g) {
  // Entity ids come from a process-wide counter, so they are left out: the order of the list identifies an enemy.
  return g.enemies.map((e) => ({
    kind: e.kind ?? null,
    rig: e.rig ?? null,
    pos: point(e.pos),
    facing: point(e.facing),
    hp: e.hp,
    alerted: !!e.alerted,
    ready: e.ready,
    recoverUntil: e.recoverUntil,
    staggerUntil: e.staggerUntil,
    flashUntil: e.flashUntil,
    swing: swing(e.swing),
    response: e.response ? [e.response.clip, e.response.start, e.response.ticks] : null,
  }));
}
const snapshot = (g) => ({
  t: g.time,
  tick: g.tick ?? null,
  wave: g.wave,
  finished: g.finished,
  player: player(g),
  enemies: enemies(g),
  loot: (g.loot ?? []).map((l) => [l.kind, l.tier, point(l.pos)]),
  bolts: (g.bolts ?? []).map((b) => [point(b.pos), b.amount]),
});

// A repeating script of intents, indexed by tick, so the player attacks, guards, dodges and walks.
function intentAt(i, aimTo) {
  const phase = i % 240;
  const aim = aimTo ?? { x: 0, z: 1 };
  if (phase < 20) return { move: { x: 1, z: 0 }, aim };
  if (phase < 22) return { actions: ["slash"], aim };
  if (phase < 50) return { aim };
  if (phase === 50) return { actions: ["stab"], aim };
  if (phase < 80) return { move: { x: -1, z: 0.5 }, aim };
  if (phase === 80) return { actions: ["heavy"], aim };
  if (phase < 110) return { guard: true, guardPressed: phase === 100, aim };
  if (phase === 120) return { dodge: true, move: { x: 0, z: 1 } };
  if (phase === 150) return { actions: ["special"], aim };
  if (phase < 200) return { move: { x: 0, z: 1 }, aim };
  return { aim };
}

// Legacy (non-pilot) mode on an open field: the three waves, every enemy kind, hits, loot.
export function traceLegacy() {
  const out = {};
  const g = createGame(open);
  const frames = [];
  for (let i = 0; i < 1800; i++) {
    if (i === 30) g.started = true;
    stepGame(g, intentAt(i), 1 / 60);
    if (i % 6 === 0) frames.push(snapshot(g));
    if (g.finished) break;
  }
  out.waves = frames;
  // A sturdy player lets all three waves, the 400 HP Warlord and the loot they drop play out.
  const long = createGame(open);
  long.started = true;
  long.player.hp = long.player.maxHP = 5000;
  const longFrames = [];
  for (let i = 0; i < 6000; i++) {
    if (i === 900 || i === 2100) {
      long.enemies = [];
      long.nextWave = long.time;
    }
    const near = long.enemies.find((e) => e.hp > 0);
    stepGame(
      long,
      intentAt(i, near ? { x: near.pos.x - long.player.pos.x, z: near.pos.z - long.player.pos.z } : undefined),
      1 / 60,
    );
    if (i % 12 === 0) longFrames.push(snapshot(long));
    if (long.finished) break;
  }
  out.long = longFrames;
  // Forced scenarios straight from the combat tests: one of each kind in range, then loot of each kind and tier.
  const hand = createGame(open);
  hand.enemies = [0, 1, 2, 3].map((kind, i) => Object.assign(enemy(kind, { x: -3 + i * 2, z: -3 }), { alerted: true }));
  hand.wave = 1;
  const handFrames = [];
  for (let i = 0; i < 900; i++) {
    stepGame(hand, intentAt(i, { x: 0, z: -1 }), 1 / 60);
    if (i % 5 === 0) handFrames.push(snapshot(hand));
    if (hand.finished) break;
  }
  out.kinds = handFrames;
  const hits = createGame(open);
  hits.enemies = [enemy(0, { x: 0, z: -4 })];
  hits.wave = 1;
  const hitFrames = [];
  const hit = (name, fn) => {
    fn();
    hitFrames.push([name, snapshot(hits)]);
  };
  hit("parry", () => {
    stepGame(hits, { guard: true, guardPressed: true, aim: { x: 0, z: 1 } }, 1 / 60);
    receiveHit(hits, { amount: 9, origin: hits.enemies[0].pos, block: true, parry: true, attacker: hits.enemies[0] });
  });
  hit("late guard", () => {
    for (let i = 0; i < 14; i++) stepGame(hits, { guard: true, aim: { x: 0, z: 1 } }, 1 / 60);
    receiveHit(hits, { amount: 20, origin: { x: 0, z: -4 }, block: true });
  });
  hit("rear", () => receiveHit(hits, { amount: 20, origin: { x: 0, z: 4 }, block: true }));
  hit("guard break", () => {
    hits.player.guard = 2;
    stepGame(hits, { guard: true, aim: { x: 0, z: 1 } }, 1 / 60);
    receiveHit(hits, { amount: 23, origin: { x: 0, z: -4 }, block: true });
  });
  hit("dodge", () => {
    for (let i = 0; i < 60; i++) stepGame(hits, {}, 1 / 60);
    stepGame(hits, { dodge: true, move: { x: 1, z: 0 } }, 1 / 60);
    receiveHit(hits, { amount: 25, origin: { x: 0, z: -4 } });
    for (let i = 0; i < 30; i++) stepGame(hits, {}, 1 / 60);
    receiveHit(hits, { amount: 25, origin: { x: 0, z: -4 } });
  });
  hit("loot", () => {
    hits.player.hp = 40;
    for (const tier of [0, 1, 2, 3])
      hits.loot = [0, 1, 2].map((kind, n) => ({ id: 100 + tier * 3 + n, pos: { ...hits.player.pos }, kind, tier }));
    stepGame(hits, {}, 1 / 60);
  });
  hit("bolt", () => {
    hits.bolts = [{ id: 42, pos: { x: 0, z: -6.7 }, dir: { x: 0, z: 1 }, amount: 12, expires: 4 }];
    for (let i = 0; i < 12; i++) stepGame(hits, {}, 1 / 60);
  });
  out.hits = hitFrames;
  return out;
}

// Pilot (production) mode on the real east-bridge area with its residents.
export function tracePilot() {
  const f = fixture();
  f.restore();
  const g = f.g;
  const frames = [];
  const target = g.enemies.find((e) => e.hp > 0);
  // Stand in the target's reach so both sides fight: the first clear spot 1.8 m away.
  for (let k = 0; k < 72 && target; k++) {
    const a = (k * Math.PI) / 36,
      spot = { x: target.pos.x + Math.cos(a) * 1.8, z: target.pos.z + Math.sin(a) * 1.8 };
    if (f.world.geometry.clear(spot, 0.4) && f.world.lineClear(spot, target.pos)) {
      g.player.pos = spot;
      break;
    }
  }
  if (target) target.alerted = true;
  for (let i = 0; i < 1200; i++) {
    const aim = target ? { x: target.pos.x - g.player.pos.x, z: target.pos.z - g.player.pos.z } : undefined;
    stepGame(g, intentAt(i, aim), 1 / 60);
    if (i % 8 === 0) frames.push(snapshot(g));
    if (g.finished) break;
  }
  return frames;
}
