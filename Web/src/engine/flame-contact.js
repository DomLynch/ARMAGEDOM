import { combatTargetHeight } from "../pistol-targeting.js";
import { GAME_DATA } from "./game-data.js";
// weapons.json targeting.shot: the body ellipsoid shared with the pistol ray test.
const BODY = GAME_DATA.weapons.targeting.shot;
const sq = (x) => x * x;
const finite = (p) => p && ["x", "y", "z"].every((k) => Number.isFinite(p[k]));
// The normal registered body collision envelope intersects the emitted cone.
// No target score, hit probability, damaging burn or species-specific controller.
export function flameTouches({ source, target, time, profile, lineClear, playerPosition }) {
  if (
    !finite(source?.position) ||
    !finite(source?.direction) ||
    !target ||
    !Number.isFinite(target.hp) ||
    !(target.hp > 0) ||
    !Number.isFinite(target.pos?.x) ||
    !Number.isFinite(target.pos?.z) ||
    typeof lineClear !== "function" ||
    !Number.isFinite(profile?.range) ||
    profile.range <= 0 ||
    !Number.isFinite(profile.coneDegrees) ||
    profile.coneDegrees <= 0 ||
    profile.coneDegrees >= 180
  )
    return false;
  const o = source.position,
    d = source.direction,
    n = Math.hypot(d.x, d.y, d.z);
  if (n < 1e-8) return false;
  const axis = { x: d.x / n, y: d.y / n, z: d.z / n },
    height = combatTargetHeight(target, time),
    v = { x: target.pos.x - o.x, y: height - o.y, z: target.pos.z - o.z },
    along = v.x * axis.x + v.y * axis.y + v.z * axis.z;
  if (
    !Number.isFinite(height) ||
    height <= 0 ||
    !Number.isFinite(target.radius) ||
    target.radius <= 0 ||
    !Number.isFinite(along) ||
    !Number.isFinite(playerPosition?.x) ||
    !Number.isFinite(playerPosition?.z)
  )
    return false;
  const horizontal = Math.max(BODY.bodyMinRadius, target.radius),
    vertical = Math.max(BODY.bodyMinHalfHeight, height * BODY.bodyHeightRatio),
    radial = { x: v.x - along * axis.x, y: v.y - along * axis.y, z: v.z - along * axis.z },
    distance = Math.hypot(radial.x, radial.y, radial.z),
    support =
      distance > 1e-8 ? Math.hypot(radial.x * horizontal, radial.y * vertical, radial.z * horizontal) / distance : 0,
    axial = Math.hypot(axis.x * horizontal, axis.y * vertical, axis.z * horizontal);
  if (along <= 0) {
    // At point blank the nozzle may be inside the ordinary body envelope.
    // Require an actual FORWARD ray/ellipsoid intersection; a body wholly
    // behind the muzzle still cannot be hit, even when it is the locked target.
    const a = sq(axis.x / horizontal) + sq(axis.y / vertical) + sq(axis.z / horizontal),
      b = -((v.x * axis.x) / sq(horizontal) + (v.y * axis.y) / sq(vertical) + (v.z * axis.z) / sq(horizontal)),
      c = sq(v.x / horizontal) + sq(v.y / vertical) + sq(v.z / horizontal) - 1,
      disc = b * b - a * c;
    if (disc < 0 || (-b + Math.sqrt(disc)) / a <= 0 || (-b - Math.sqrt(disc)) / a > profile.range) return false;
  } else if (
    along - axial > profile.range ||
    distance > Math.tan((profile.coneDegrees * Math.PI) / 360) * Math.min(profile.range, along) + support
  )
    return false;
  const origin = { x: o.x, z: o.z };
  return lineClear(playerPosition, origin) === true && lineClear(origin, target.pos) === true;
}
