import { tracePistol } from "../pistol.js";
import { combatTargetHeight } from "../pistol-targeting.js";
import { radialBlastHits } from "./radial-blast.js";
import { safehouseProtected, safehouseBlocksSegment } from "./safehouse.js";
import { GAME_DATA } from "./game-data.js";

// NPC-only rules. Player weapons, ammunition and paid-action clocks stay separate.
// The numbers live in Web/src/data/weapons.json `bossRanged` (read through game-data.js).
export const BOSS_RANGED_RULES = GAME_DATA.weapons.bossRanged;
const BOSS_RANGED_EXTRA = GAME_DATA.bossRangedExtra;
const EPS = 1e-8,
  flat = (p) => ({ x: p.x, z: -p.z }),
  lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
const finite = (p) => p && [p.x, p.y, p.z].every(Number.isFinite);
export function stopBossRanged(g, e) {
  if (e.bossRanged) {
    e.bossRanged = null;
    const p = BOSS_RANGED_RULES[e.rig];
    e.ready = Math.max(e.ready ?? 0, g.time + (p?.recovery ?? 0));
  }
  g.bossRockets = (g.bossRockets ?? []).filter((r) => r.ownerId !== e.id);
}
export function clearBossRanged(g) {
  if (!g) return;
  for (const e of g.enemies ?? []) stopBossRanged(g, e);
  g.bossRockets = [];
  g.bossRocketBlast = null;
}

export function stepBossRanged(g, e, dt, { patrol, move, receive, source, trace } = {}) {
  const p = BOSS_RANGED_RULES[e.rig];
  if (!p || !e.bossProfile) return false;
  if (
    g.bossRangedInputCancelled ||
    e.hp <= 0 ||
    g.finished ||
    g.player.hp <= 0 ||
    g.runSaveInvalid ||
    safehouseProtected(g) ||
    g.time < e.recoverUntil ||
    g.time < e.staggerUntil
  ) {
    stopBossRanged(g, e);
    return true;
  }
  if (e.home && patrol(g, e, dt)) {
    stopBossRanged(g, e);
    return true;
  }
  let state = e.bossRanged;
  if (!state) {
    if (e.swing || g.time + EPS < e.ready) return false;
    const distance = Math.hypot(g.player.pos.x - e.pos.x, g.player.pos.z - e.pos.z),
      melee = Object.values(e.bossProfile.attacks)[0];
    if (distance <= melee.range * e.combatScale) return false;
    const bearing = { x: (g.player.pos.x - e.pos.x) / distance, z: (g.player.pos.z - e.pos.z) / distance };
    if (distance > p.range || !g.world.lineClear(e.pos, g.player.pos)) {
      move(g, e, bearing, e.moveSpeed, dt);
      return true;
    }
    e.facing = bearing;
    const muzzle = source?.(g, e);
    if (!finite(muzzle) || !g.world.lineClear(e.pos, flat(muzzle))) return true;
    state = e.bossRanged = {
      kind: p.kind,
      phase: "warning",
      start: g.time,
      releaseAt: g.time + p.warning,
      bearing,
      target: { x: g.player.pos.x, y: combatTargetHeight(g.player, g.time), z: -g.player.pos.z },
      areaId: g.world.areaId,
    };
    g.events.push({
      type: "boss-ranged-warning",
      actor: e,
      weapon: p.kind,
      dir: { ...bearing },
      range: p.range,
      arc: BOSS_RANGED_EXTRA[p.kind].warningArcDegrees,
      until: state.releaseAt,
    });
    return true;
  }
  if (state.areaId !== g.world.areaId) {
    stopBossRanged(g, e);
    return true;
  }
  e.facing = { ...state.bearing };
  if (g.time + EPS < state.releaseAt) return true;
  if (p.kind === "rocket" && (g.bossRockets ?? []).some((r) => r.ownerId === e.id)) return true;
  // Read the actual posed muzzle once. Aim was committed at warning start.
  const muzzle = source?.(g, e);
  e.bossRanged = null;
  e.ready = g.time + p.recovery;
  if (!finite(muzzle) || !g.world.lineClear(e.pos, flat(muzzle))) return true;
  e.bossRangedFiredAt = g.time;
  if (p.kind === "shotgun") {
    const origin = flat(muzzle),
      dx = state.target.x - muzzle.x,
      dz = -state.target.z + muzzle.z,
      n = Math.hypot(dx, dz);
    if (n < EPS) return true;
    const pellets = [];
    let hits = 0;
    const fan = BOSS_RANGED_EXTRA.shotgun;
    for (let i = 0; i < fan.pellets; i++) {
      const angle = ((-fan.spreadDegrees + (i * fan.spreadDegrees * 2) / (fan.pellets - 1)) * Math.PI) / 180,
        c = Math.cos(angle),
        s = Math.sin(angle),
        direction = { x: (dx / n) * c - (dz / n) * s, z: (dx / n) * s + (dz / n) * c };
      const ray = tracePistol(
        origin,
        direction,
        [],
        (a, b) => g.world.lineClear(a, b) && !safehouseBlocksSegment(g, a, b),
        { range: p.range },
      );
      if (!ray) continue;
      const distance = Math.hypot(ray.end.x - origin.x, ray.end.z - origin.z),
        end = { x: ray.end.x, y: muzzle.y + ((state.target.y - muzzle.y) * distance) / n, z: -ray.end.z },
        contact = trace?.(g, muzzle, end);
      if (contact?.enemy?.id === g.player.id) hits++;
      pellets.push({ ...ray, ...(contact ? { end: flat(contact.position) } : {}), npcSource: { ...muzzle } });
    }
    g.events.push({
      type: "boss-shotgun-shot",
      actor: e,
      ownerId: e.id,
      targetId: g.player.id,
      weapon: "shotgun",
      pellets,
      damage: hits,
    });
    if (hits)
      receive(g, {
        amount: Math.min(p.damage, hits),
        origin,
        attacker: e,
        weapon: "shotgun",
        moveId: "boss-shotgun",
        block: true,
        parry: false,
        def: {
          weapon: "shotgun",
          moveId: "boss-shotgun",
          stagger: fan.stagger,
          chip: 0,
          staminaDamage: fan.staminaDamage,
        },
      });
  } else {
    const d = { x: state.target.x - muzzle.x, y: state.target.y - muzzle.y, z: state.target.z - muzzle.z },
      n = Math.hypot(d.x, d.y, d.z);
    if (n < EPS) return true;
    const direction = { x: d.x / n, y: d.y / n, z: d.z / n },
      id = "boss-rocket:" + e.id + ":" + g.tick;
    (g.bossRockets ??= []).push({
      id,
      ownerId: e.id,
      areaId: g.world.areaId,
      position: { ...muzzle },
      direction,
      distance: 0,
      lastAt: g.time,
      startedAt: g.time,
    });
    g.events.push({
      type: "boss-rocket-launch",
      actor: e,
      ownerId: e.id,
      targetId: g.player.id,
      weapon: "rocket",
      id,
      position: { ...muzzle },
      direction,
    });
  }
  return true;
}

export function stepBossRockets(g, { trace, receive } = {}) {
  const pending = g.bossRockets ?? [];
  g.bossRockets = [];
  const p = BOSS_RANGED_RULES["boss-butcher"],
    rocket = BOSS_RANGED_EXTRA.rocket;
  if (g.finished || g.player.hp <= 0 || g.runSaveInvalid || safehouseProtected(g)) return;
  const owners = new Set();
  for (const row of pending) {
    const owner = g.enemies.find((e) => e.id === row.ownerId && e.hp > 0 && e.rig === "boss-butcher");
    if (
      !owner ||
      owners.has(owner.id) ||
      row.areaId !== g.world.areaId ||
      g.time < row.lastAt ||
      g.time < owner.recoverUntil ||
      g.time < owner.staggerUntil
    )
      continue;
    owners.add(owner.id);
    const advance = Math.min(p.range - row.distance, Math.max(0, g.time - row.lastAt) * p.speed),
      from = row.position,
      to = {
        x: from.x + row.direction.x * advance,
        y: from.y + row.direction.y * advance,
        z: from.z + row.direction.z * advance,
      };
    let fraction = Infinity,
      kind = null;
    if (to.y <= rocket.groundHeight) {
      fraction = Math.max(0, Math.min(1, (from.y - rocket.groundHeight) / (from.y - to.y)));
      kind = "ground";
    }
    if (!g.world.lineClear(flat(from), flat(to)) || safehouseBlocksSegment(g, flat(from), flat(to))) {
      let lo = 0,
        hi = 1;
      for (let i = 0; i < rocket.bisectSteps; i++) {
        const mid = (lo + hi) / 2,
          end = flat(lerp(from, to, mid));
        if (g.world.lineClear(flat(from), end) && !safehouseBlocksSegment(g, flat(from), end)) lo = mid;
        else hi = mid;
      }
      if (lo < fraction) {
        fraction = lo;
        kind = "wall";
      }
    }
    const contact = trace?.(g, from, to);
    if (contact) {
      const at =
        Math.hypot(contact.position.x - from.x, contact.position.y - from.y, contact.position.z - from.z) /
        Math.max(EPS, advance);
      if (at < fraction) {
        fraction = at;
        kind = "surface";
      }
    }
    if (kind === null && (row.distance + advance + EPS >= p.range || g.time - row.startedAt + EPS >= p.maxLife)) {
      fraction = 1;
      kind = "range";
    }
    if (kind === null) {
      g.bossRockets.push({ ...row, position: to, distance: row.distance + advance, lastAt: g.time });
      continue;
    }
    // Consume first; direct surface contact never adds a second damage payment.
    const position = flat(lerp(from, to, fraction));
    g.bossRocketBlast = { id: row.id, areaId: row.areaId, position, time: g.time, radius: p.radius };
    g.events.push({
      type: "boss-rocket-blast",
      actor: owner,
      ownerId: owner.id,
      targetId: g.player.id,
      weapon: "rocket",
      id: row.id,
      position,
      radius: p.radius,
      contact: kind,
    });
    const hits = radialBlastHits(
      position,
      row.areaId,
      [
        {
          victimId: "player",
          areaId: g.world.areaId,
          position: g.player.pos,
          hp: g.player.hp,
          eligible: g.world.lineClear(position, g.player.pos) && !safehouseBlocksSegment(g, position, g.player.pos),
        },
      ],
      { radius: p.radius, maxDamage: p.damage },
    );
    for (const hit of hits)
      receive(g, {
        amount: hit.damage,
        origin: position,
        attacker: owner,
        weapon: "rocket",
        moveId: "boss-rocket",
        block: true,
        parry: false,
        def: {
          weapon: "rocket",
          moveId: "boss-rocket",
          stagger: rocket.stagger,
          chip: 0,
          staminaDamage: rocket.staminaDamage,
        },
      });
  }
}
