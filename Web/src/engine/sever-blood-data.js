import { insidePolygon } from "../world-geometry.js";
// Presentation values only. Existing FX pools own clocks, slots and disposal.
export const SEVER_BLOOD_DATA = Object.freeze({
  jet: Object.freeze({ capacity: 2, duration: 0.5, length: 1.2, radius: 0.075 }),
  pool: Object.freeze({ settleSeconds: 0.1, capacity: 4, lifetime: 4, spreadSeconds: 0.4, radius: 0.5, opacity: 0.7 }),
  headDropletLifetime: 1.25,
  headDropletGravity: 4,
});
const point = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
function distanceSquared(p, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    denominator = dx * dx + dz * dz;
  const t = denominator ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / denominator)) : 0;
  return (p.x - a.x - t * dx) ** 2 + (p.z - a.z - t * dz) ** 2;
}
// Painted silhouettes include stairs/props that collision alone may permit.
// Reject the complete circle on contact with any projected mask, not just its centre.
export function groundPoolPlacement({ layout, geometry, position, radius = SEVER_BLOOD_DATA.pool.radius } = {}) {
  if (
    !point(position) ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    radius > SEVER_BLOOD_DATA.pool.radius ||
    !Array.isArray(layout?.masks) ||
    typeof geometry?.clear !== "function" ||
    typeof geometry?.ground !== "function"
  )
    return null;
  try {
    const centre = { x: position.x, z: position.z };
    if (geometry.clear(centre, radius) !== true) return null;
    for (const mask of layout.masks) {
      if (!Array.isArray(mask?.points) || mask.points.length < 3) return null;
      const polygon = [];
      for (const p of mask.points) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
        const projected = geometry.ground(p);
        if (!point(projected)) return null;
        polygon.push(projected);
      }
      // Projection roundoff must not turn a tangent footprint into an allowed pool.
      if (
        insidePolygon(centre, polygon) ||
        polygon.some((a, i) => distanceSquared(centre, a, polygon[(i + 1) % polygon.length]) <= radius * radius + 1e-12)
      )
        return null;
    }
    return { position: centre, radius };
  } catch {
    return null;
  }
}
