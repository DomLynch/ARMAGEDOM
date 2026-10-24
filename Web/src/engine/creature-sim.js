// Headless creature sim for shared enemies (W3). No DOM, no rendering. Presence steps it at 5-10 Hz; it runs the
// SAME creature code single-player runs (combat.js stepCreatureAI / resolveCreatureContacts), so behaviour is
// identical. Boundary and limits: combat-w3-authority.md.
import { createGame, stepCreatureAI, resolveCreatureContacts, applyCreatureHit } from "../combat.js";

const TICK = 1 / 60; // the knife pilot requires fixed 60 Hz ticks
const MAX_DT = 0.25;
const snapshot = (e) => ({ ...e, pos: { ...e.pos }, facing: { ...e.facing } });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const point = (p) => ({ x: p.x, z: p.z });
const PLAYER_FIELDS = ["hp", "dodgeUntil", "guarding", "parryUntil", "stamina"];

/**
 * createCreatureSim({ game } | { world, pilot, creatures })
 *   game      an existing renderer-free run (tests); otherwise one is made with createGame(world, pilot);
 *   creatures replaces game.enemies with these creature entities (shared enemies of one area layer).
 * step({ players, hits, dt, services, rules }) -> { ok, creatures, events }
 *   players  [{ id, pos, facing, hp, radius?, dodgeUntil?, guarding?, parryUntil?, stamina? }]: the last presence
 *            report per player. Players are not simulated; each creature targets the nearest living one.
 *   hits     [{ creatureId, playerId, weapon, damage, direction? }] claims already checked by the caller; damage
 *            is clamped to rules[weapon].maxDamagePerHit and unknown weapons are dropped.
 *   rules    weaponRules() rows ({ [weapon]: { maxDamagePerHit } }).
 */
export function createCreatureSim({ game, world, pilot, creatures } = {}) {
  const g = game ?? createGame(world, pilot);
  if (creatures) g.enemies = creatures;
  const template = structuredClone(g.player),
    entities = new Map();
  let previous = { creatures: [], events: [] };
  const entityFor = (p) => {
    let e = entities.get(p.id);
    if (!e) entities.set(p.id, (e = structuredClone(template)));
    e.pos = point(p.pos);
    e.facing = point(p.facing);
    if (p.radius !== undefined) e.radius = p.radius;
    for (const key of PLAYER_FIELDS) if (p[key] !== undefined) e[key] = p[key];
    return e;
  };
  const view = () =>
    g.enemies.map((e) => ({
      id: e.id,
      placementKey: e.placementKey ?? null,
      rig: e.rig,
      pos: point(e.pos),
      facing: point(e.facing),
      state: e.hp <= 0 ? "dead" : e.swing ? "attack" : e.staggerUntil > g.time ? "stagger" : e.alerted ? "alert" : "idle",
      clip: e.response?.clip ?? null,
      hp: e.hp,
      maxHp: e.maxHP,
      alive: e.hp > 0,
    }));
  function applyHits(hits, rules, events) {
    for (const h of hits ?? []) {
      const rule = rules?.[h.weapon];
      if (!rule || !Number.isFinite(h.damage) || h.damage <= 0) continue;
      const target = g.enemies.find((e) => e.id === h.creatureId && e.hp > 0);
      if (!target) continue;
      const damage = Math.min(h.damage, rule.maxDamagePerHit),
        before = target.hp;
      applyCreatureHit(g, { creatureId: h.creatureId, direction: h.direction, weapon: h.weapon, damage });
      events.push({ type: "creature-hit", creatureId: target.id, playerId: h.playerId ?? null, amount: before - target.hp });
      if (target.hp <= 0) events.push({ type: "creature-death", creatureId: target.id, playerId: h.playerId ?? null });
    }
  }
  function tick(players, services, events) {
    g.time += TICK;
    g.tick++;
    g.events = [];
    const live = players.filter((p) => entities.get(p.id).hp > 0);
    if (!live.length) return;
    const groups = new Map(live.map((p) => [p.id, []]));
    for (const c of g.enemies) {
      if (c.hp <= 0) continue;
      let best = live[0];
      for (const p of live) if (dist(p.pos, c.pos) < dist(best.pos, c.pos)) best = p;
      groups.get(best.id).push(c);
    }
    for (const p of live) {
      const entity = entities.get(p.id),
        hpBefore = entity.hp;
      g.player = entity;
      g.finished = false;
      const before = new Map([entity, ...g.enemies].map((e) => [e.id, snapshot(e)]));
      stepCreatureAI(g, TICK, services, groups.get(p.id));
      resolveCreatureContacts(g, before, null);
      if (entity.hp < hpBefore) events.push({ type: "hurt", playerId: p.id, amount: hpBefore - entity.hp });
      g.finished = false;
    }
  }
  return {
    game: g,
    /** The sim's own copy of a reported player (hp, stamina, hurt timers after creature attacks), or null. */
    player: (id) => entities.get(id) ?? null,
    step({ players = [], hits = [], dt = 0.1, services = {}, rules = {} } = {}) {
      const events = [];
      try {
        if (!Number.isFinite(dt) || dt < 0) throw new TypeError("Finite nonnegative dt required");
        const reported = players.map((p) => {
          entityFor(p);
          return p;
        });
        applyHits(hits, rules, events);
        for (let n = Math.ceil(Math.min(dt, MAX_DT) / TICK - 1e-9); n > 0; n--) tick(reported, services, events);
        previous = { creatures: view(), events };
        return { ok: true, creatures: previous.creatures, events };
      } catch (error) {
        // A failed step never takes presence down; the last good snapshot stands.
        return { ok: false, error: String(error?.message ?? error), creatures: previous.creatures, events: [] };
      }
    },
  };
}
