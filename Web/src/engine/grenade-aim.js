import { GAME_DATA } from "./game-data.js";
import { rangedTargets, chainedSight } from "../pistol-targeting.js";
// Auto-aim for the thrown grenades (standard and sticky share it): lock the nearest valid hostile in range when the aim found none,
// and lead a walking body so the one-second fuse lands the blast where it will be. Numbers: data/combatRules.json bossWeapon.grenadeAim.
const BOSS_WEAPON = GAME_DATA.combatRules.bossWeapon,
  AIM = BOSS_WEAPON.grenadeAim,
  payload = () => GAME_DATA.weapons.ranged["standard-grenade-v1"].payload,
  EPS = 1e-8,
  dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// The sim keeps no velocity, so read it from where each body was on the previous step. Call once per step while a grenade is held.
export function trackBodies(g) {
  const before = g.grenadeTracks ?? {},
    now = {};
  for (const e of g.enemies ?? []) {
    const prev = before[e.id],
      dt = prev ? g.time - prev.time : 0;
    let { vx, vz } = prev ?? { vx: 0, vz: 0 };
    if (prev && dt <= 0) {
      now[e.id] = prev;
      continue;
    }
    if (prev) {
      const sx = (e.pos.x - prev.x) / dt,
        sz = (e.pos.z - prev.z) / dt,
        jump = dt > AIM.maxSampleGap || Math.hypot(sx, sz) > AIM.maxSpeed;
      vx = jump ? 0 : vx + (sx - vx) * AIM.velocityBlend;
      vz = jump ? 0 : vz + (sz - vz) * AIM.velocityBlend;
    }
    now[e.id] = { x: e.pos.x, z: e.pos.z, time: g.time, vx, vz };
  }
  g.grenadeTracks = now;
}

function landable(g, point) {
  const p = g.player.pos,
    d = dist(p, point);
  return (
    d > AIM.rangeMargin &&
    d <= payload().maxRange - AIM.rangeMargin &&
    !!g.world.geometry?.clear(point, BOSS_WEAPON.grenadeLandingClearance) &&
    chainedSight(g)(p, point)
  );
}
// Where the blast should go for this body: its position plus its walk over the fuse, backed off until the spot is open ground in range.
export function grenadeLanding(g, target) {
  const track = g.grenadeTracks?.[target.id],
    speed = track ? Math.hypot(track.vx, track.vz) : 0,
    travel = speed >= AIM.minSpeed ? Math.min(AIM.maxLead, speed * payload().fuseSeconds * AIM.leadScale) : 0;
  for (let i = 0; i <= AIM.backoffSteps; i++) {
    const f = travel > 0 ? 1 - i / AIM.backoffSteps : 0,
      lead = { x: target.pos.x + (track.vx ?? 0) / (speed || 1) * travel * f, z: target.pos.z + (track.vz ?? 0) / (speed || 1) * travel * f },
      out = dist(g.player.pos, lead) / (payload().maxRange - AIM.rangeMargin),
      // A lead past the weapon's reach slides back along the line to the player, so the blast still covers the walking body.
      point = out > 1 ? { x: g.player.pos.x + (lead.x - g.player.pos.x) / out, z: g.player.pos.z + (lead.z - g.player.pos.z) / out } : lead;
    if (landable(g, point)) return point;
    if (travel <= 0) break;
  }
  return null;
}
const nearestTo = (g, from, list, limit) =>
  list
    .filter((t) => dist(from, t.pos) <= limit && grenadeLanding(g, t))
    .sort((a, b) => dist(from, a.pos) - dist(from, b.pos) || (String(a.id) < String(b.id) ? -1 : 1))[0] ?? null;

// `result` is resolveRangedAim's answer (explicit tap, cursor body, or the straight trace). Returns the body to lock, the point the reticle
// sits on and the landing point, or null when nothing can be thrown.
export function grenadeAim(g, result, { visibleIds, cursor = false } = {}) {
  let target = result.target;
  if (!target && g.mobileAssistEnabled !== false) {
    const bodies = rangedTargets(g, visibleIds).filter((t) => dist(g.player.pos, t.pos) > EPS);
    target = cursor
      ? nearestTo(g, result.position, bodies, AIM.cursorSnapRadius)
      : nearestTo(g, g.player.pos, bodies, payload().maxRange - AIM.rangeMargin);
  }
  const landing = target ? grenadeLanding(g, target) : null;
  return landing ? { target, aim: { ...target.pos }, landing } : { target: null, aim: result.position, landing: result.position };
}
