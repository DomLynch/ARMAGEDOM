// Adapted from Frankendom303af39e; exact source hashes in provenance.json.
import { knifePaths } from "./knife-paths.js";
import { GAME_DATA } from "../engine/game-data.js";
// The numbers live in Web/src/data/weapons.json `knife` (read through game-data.js); the donor's source is in provenance.json.
const KNIFE = GAME_DATA.weapons.knife;
export const KNIFE_RULES = KNIFE.rules;
// One move row from its named fields. Seconds are derived from ticks at 60 Hz; every move shares one arc and is parryable.
const move = (moveId, row) =>
  Object.freeze({
    moveId,
    clip: row.clip,
    path: row.path,
    windupTicks: row.windupTicks,
    activeTicks: row.activeTicks,
    recoveryTicks: row.recoveryTicks,
    windup: row.windupTicks / 60,
    active: row.activeTicks / 60,
    recovery: row.recoveryTicks / 60,
    damage: row.damage,
    staminaDamage: row.staminaDamage,
    stamina: row.stamina,
    stagger: row.staggerTicks / 60,
    chip: row.chip,
    range: row.reach,
    stepIn: row.stepIn,
    knockback: row.knockback,
    sourceContact: row.sourceContact,
    arc: 90,
    parryable: true,
    cooldown: row.cooldown ?? 0,
  });
export const KNIFE_MOVES = Object.freeze(Object.fromEntries(Object.entries(KNIFE.moves).map(([id, row]) => [id, move(id, row)])));
export const KNIFE_STAMINA_COSTS = KNIFE.staminaCosts;
export const KNIFE_COOLDOWNS = Object.freeze({
  heavy: KNIFE.cooldowns.heavy,
  special: KNIFE.cooldowns.special,
  dodge: KNIFE.cooldowns.dodgeTicks / 60,
});
// Shared by donor animation sampling and its offline bake. Character must use this
// for path-backed moves; Skill_Pommel has its own authored phase map.
export function swingProgress(progress, contact = 0.35, sourceContact = 0.34) {
  const keys = [
    [0, 0],
    [contact * 0.7, sourceContact * 0.44],
    [contact, sourceContact],
    [contact + 0.16, sourceContact + (1 - sourceContact) * 0.56],
    [1, 1],
  ];
  const p = Math.max(0, Math.min(1, progress));
  for (let i = 1; i < keys.length; i++)
    if (p <= keys[i][0]) {
      const [x, y] = keys[i - 1],
        [end, value] = keys[i];
      return y + ((value - y) * (p - x)) / (end - x);
    }
  return 1;
}
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (x) => Math.max(0, Math.min(1, x));
export function segmentDistance(a, b, c, d) {
  const u = sub(b, a),
    v = sub(d, c),
    w = sub(a, c),
    aa = dot(u, u),
    bb = dot(u, v),
    cc = dot(v, v),
    dd = dot(u, w),
    ee = dot(v, w),
    denominator = aa * cc - bb * bb;
  let s =
    aa < 1e-12 ? 0 : cc < 1e-12 ? clamp(-dd / aa) : denominator > 1e-12 ? clamp((bb * ee - cc * dd) / denominator) : 0;
  let t = cc < 1e-12 ? 0 : (bb * s + ee) / cc;
  if (t < 0) {
    t = 0;
    s = aa < 1e-12 ? 0 : clamp(-dd / aa);
  } else if (t > 1) {
    t = 1;
    s = aa < 1e-12 ? 0 : clamp((bb - dd) / aa);
  }
  return Math.hypot(...sub(mix(a, b, s), mix(c, d, t)));
}
export function bladePose(rig, path, age, paths = null) {
  const frames = paths?.[path] ?? knifePaths[rig]?.[path];
  if (!frames) throw Error(`no knife ${path} bake on ${rig}`);
  const frame = Math.max(0, Math.min(frames.length - 1, age)),
    index = Math.floor(frame);
  return mix(frames[index], frames[Math.min(index + 1, frames.length - 1)], frame - index);
}
// Domain reflection matches actors.js yaw atan2(facing.x,-facing.z) and world
// toRender(x,y,-z). Local +Z points forward; local +X points to domain -X at +Z.
export function worldBlade(body, path, age) {
  const pose = bladePose(body.rig, path, age, body.contactPaths),
    f = body.facing,
    k = body.contactScale ?? body.combatScale ?? 1;
  return [0, 3].map((o) => {
    const [x, y, z] = pose.slice(o, o + 3);
    return [body.pos.x + k * (-x * f.z + z * f.x), y * k, body.pos.z + k * (x * f.x + z * f.z)];
  });
}
export function bladeContact(attackerBefore, attackerAfter, targetBefore, targetAfter, path, fromAge, toAge) {
  const relative = (blade, target) => blade.map((p) => [p[0] - target.pos.x, p[1], p[2] - target.pos.z]);
  const a = relative(worldBlade(attackerBefore, path, fromAge), targetBefore),
    b = relative(worldBlade(attackerAfter, path, toAge), targetAfter);
  const steps = Math.max(1, Math.ceil(Math.max(Math.hypot(...sub(a[0], b[0])), Math.hypot(...sub(a[1], b[1]))) / 0.02));
  const k = (targetAfter.combatScale ?? 1) * (targetAfter.bodyScale ?? 1);
  for (let i = 0; i <= steps; i++)
    if (
      segmentDistance(mix(a[0], b[0], i / steps), mix(a[1], b[1], i / steps), [0, 0.55 * k, 0], [0, 1.45 * k, 0]) <=
      0.31 * k
    )
      return true;
  return false;
}
