import { combatTargetHeight } from "../pistol-targeting.js";
import { flameTouches } from "./flame-contact.js";
import { safehouseProtected, safehouseBlocksSegment } from "./safehouse.js";
import { GAME_DATA } from "./game-data.js";
import { fillText } from "./game-data-combat-text.js";
const FLAME_TEXT = GAME_DATA.combatText.bossFlame; // data/combatText.json
// weapons.json `bossFlame.retreatDirections`: evenly spaced directions tried when a flame boss backs away.
const RETREAT_DIRECTIONS = GAME_DATA.weapons.bossFlame.retreatDirections;
const EPS = 1e-8;
// Transient NPC attack only. Inventory, player fuel and defeat persistence stay
// with their existing owners. An optional validated capability selects it.
export function stopBossFlame(g, e, reason = "interrupted") {
  if (!e.bossWeapon) return;
  const profile = e.bossWeapon.profile ?? e.bossProfile?.weapon;
  e.bossWeapon = null;
  e.ready = Math.max(e.ready, g.time + (profile?.recoveryTicks ?? 0) / 60);
  g.events.push({ type: "boss-flame-stop", actor: e, reason });
}
export function stopBossFlames(g, reason) {
  if (g) for (const e of g.enemies ?? []) stopBossFlame(g, e, reason);
}
export function stepBossFlame(
  g,
  e,
  dt,
  { patrol, move, source, receive, emit, profile = e.bossProfile?.weapon, onStart },
) {
  const p = profile;
  if (p?.kind !== "flame") return false;
  const hurt = g.time < e.recoverUntil || g.time < e.staggerUntil;
  if (e.hp <= 0 || g.finished || g.player.hp <= 0 || safehouseProtected(g) || hurt) {
    stopBossFlame(g, e);
    return true;
  }
  if (e.home && patrol(g, e, dt)) {
    stopBossFlame(g, e, "return-or-unalerted");
    return true;
  }
  let s = e.bossWeapon;
  if (s) {
    const age = g.tick - s.startTick;
    if (age >= p.windupTicks + p.activeTicks) {
      stopBossFlame(g, e, "complete");
      return true;
    }
    e.facing = { ...s.direction };
    s.phase = age < p.windupTicks ? "warning" : "active";
    if (s.phase === "active" && s.pulses < p.activeTicks / p.intervalTicks && age >= p.windupTicks + s.pulses * p.intervalTicks) {
      s.pulses++;
      const emitted = source?.(e),
        axis = emitted?.direction,
        n = axis && Math.hypot(axis.x, axis.z);
      if (
        !emitted ||
        !(n > EPS) ||
        (axis.x * s.direction.x + axis.z * s.direction.z) / n < Math.cos((p.coneDegrees * Math.PI) / 360)
      ) {
        stopBossFlame(g, e, "emitter-unavailable");
        return true;
      }
      s.source = { position: { ...emitted.position }, direction: { ...emitted.direction } };
      const blocked =
        safehouseBlocksSegment(g, e.pos, g.player.pos) || safehouseBlocksSegment(g, emitted.position, g.player.pos);
      const contact =
        !blocked &&
        flameTouches({
          source: emitted,
          target: g.player,
          time: g.time,
          profile: p,
          lineClear: (a, b) => g.world.lineClear(a, b),
          playerPosition: e.pos,
        });
      const hit =
        contact &&
        receive(g, {
          amount: p.damage,
          origin: emitted.position,
          attacker: e,
          block: false,
          parry: false,
          moveId: "boss-flame-burst",
          def: { stagger: 0, chip: 0, weapon: "flamethrower" },
        });
      emit(g, "boss-flame-pulse", {
        actor: e,
        pulse: s.pulses,
        contact: !!contact,
        damaged: !!hit,
        position: { ...emitted.position },
        dir: { ...s.direction },
      });
    }
    return true;
  }
  if (g.time + EPS < e.ready) return true;
  const dx = g.player.pos.x - e.pos.x,
    dz = g.player.pos.z - e.pos.z,
    distance = Math.hypot(dx, dz),
    direction = distance > EPS ? { x: dx / distance, z: dz / distance } : { ...e.facing };
  if (p.minDistance && distance + EPS < p.minDistance) {
    const step = Math.min(dt, (p.minDistance - distance) / e.moveSpeed),
      length = e.moveSpeed * step,
      away = { x: -direction.x, z: -direction.z };
    let retreat = away,
      best = EPS;
    // Reuse the collision mover to choose a free backward/side step. A blocked
    // straight retreat must not oscillate forever against an authored obstacle.
    for (let i = 0; i < RETREAT_DIRECTIONS; i++) {
      const a = (i * 2 * Math.PI) / RETREAT_DIRECTIONS, // tuning-ok: a full turn shared by the sampled directions
        c = Math.cos(a),
        s = Math.sin(a),
        d = { x: away.x * c - away.z * s, z: away.x * s + away.z * c },
        next = g.world.move(e.pos, { x: d.x * length, z: d.z * length }, e.radius),
        gain = Math.hypot(next.x - g.player.pos.x, next.z - g.player.pos.z) - distance;
      if (gain > best && Math.hypot(next.x - e.pos.x, next.z - e.pos.z) >= length * 0.25) {
        best = gain;
        retreat = d;
      }
    }
    move(g, e, retreat, e.moveSpeed, step, true);
    return true;
  }
  if (distance > (p.acquisitionRange ?? p.range) || !g.world.lineClear(e.pos, g.player.pos)) {
    move(g, e, direction, e.moveSpeed, dt);
    return true;
  }
  e.facing = { ...direction };
  e.bossWeapon = {
    profile: p,
    phase: "warning",
    startTick: g.tick,
    direction,
    aimPoint: { x: g.player.pos.x, y: combatTargetHeight(g.player, g.time), z: g.player.pos.z },
    pulses: 0,
    source: null,
  };
  onStart?.(g, e);
  g.message = fillText(FLAME_TEXT.warning, { name: e.bossName ?? FLAME_TEXT.defaultBossName });
  g.messageUntil = g.time + p.windupTicks / 60;
  emit(g, "boss-flame-warning", { actor: e, dir: { ...direction }, range: p.range, arc: p.coneDegrees });
  return true;
}
