import { GAME_DATA } from "./game-data.js";
import { EXIT_RINGS } from "./exit-rings-data.js";
import { markedTargets } from "./route-guidance.js";
// The small gold ring route-guidance first drew at the East Bridge exit, now at every exit of every area. Which exits and where come from
// the registry links (their condition rectangles in data/areas.json); how the ring looks from data/visual.json `exitRings`. It marks the
// exit's own trigger, not the road behind it. Presentation only: it never changes a trigger or a travel link.
function nearestOnRoad(road, p) {
  let best = null;
  for (let i = 0; i < road.length; i++) {
    const a = road[i],
      b = road[(i + 1) % road.length],
      dx = b.x - a.x,
      dz = b.z - a.z,
      t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz))),
      q = { x: a.x + t * dx, z: a.z + t * dz },
      gap = Math.hypot(p.x - q.x, p.z - q.z);
    if (!best || gap < best.gap) best = { ...q, gap };
  }
  return best;
}
// The painting's ground only exists below its horizon: try the zone's anchor point, then its corners.
function zoneGround(g, c, anchor) {
  const lo = { x: c.xMin ?? 0, y: c.yMin ?? 0 },
    hi = { x: c.xMax ?? 1, y: c.yMax ?? 1 },
    tries = [{ x: lo.x + (hi.x - lo.x) * anchor.x, y: lo.y + (hi.y - lo.y) * anchor.y }, ...[lo.x, hi.x].flatMap((x) => [lo.y, hi.y].map((y) => ({ x, y })))];
  for (const p of tries) {
    try {
      return g.ground(p);
    } catch {
      /* above the horizon: try the next point */
    }
  }
  return null;
}
// The target itself when the ring stands clear there; otherwise the first clear step from it towards the road, and from the road's edge
// inwards (towards the road's middle) when the zone lies wholly off the road.
function ringSpot(g, target, radius) {
  if (g.clear(target, radius)) return target;
  const road = nearestOnRoad(g.road, target),
    middle = g.road.reduce((s, p) => ({ x: s.x + p.x / g.road.length, z: s.z + p.z / g.road.length }), { x: 0, z: 0 }),
    step = GAME_DATA.visual.routeGuidance.sampleStep,
    walk = (from, to, length) => {
      for (let along = 0; along <= length; along += step) {
        const t = length ? along / length : 0,
          p = { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
        if (g.clear(p, radius)) return p;
      }
      return null;
    };
  return walk(target, road, road.gap) ?? walk(road, middle, Math.hypot(middle.x - road.x, middle.z - road.z)) ?? road;
}
// How far the ring stands from the road's edge and from any blocker: the widest radius (up to `clearance`) that is still clear there.
function roomAround(g, p, clearance, step) {
  let room = 0;
  while (room + step <= clearance && g.clear(p, room + step)) room += step;
  return room;
}
// An exit zone hugs the picture's edge, so the first clear spot is often against the river rail or a wall. The ring must still mark where the
// exit really fires, so it only moves inside the trigger rectangle (a point just inside every bound, as `world.travelAt` tests it): among the
// clear points there within `radius` metres of the first spot it takes the one with the most room around it (nearest on a tie), and when none
// lies that close, the clear point inside the trigger nearest to the spot. A trigger with no clear point keeps the first spot.
function centredSpot(g, spot, condition, { radius, roomStep, pictureStep, margin, clearance }) {
  const lo = { x: (condition.xMin ?? 0) + margin, y: (condition.yMin ?? 0) + margin },
    hi = { x: (condition.xMax ?? 1) - margin, y: (condition.yMax ?? 1) - margin };
  let near = null,
    closest = null;
  for (let x = lo.x; x <= hi.x; x += pictureStep) {
    for (let y = lo.y; y <= hi.y; y += pictureStep) {
      let p;
      try {
        p = g.ground({ x, y });
      } catch {
        continue; // above the horizon
      }
      if (!g.clear(p, 0)) continue;
      const gap = Math.hypot(p.x - spot.x, p.z - spot.z);
      if (!closest || gap < closest.gap) closest = { at: p, gap };
      if (gap > radius) continue;
      const room = roomAround(g, p, clearance, roomStep);
      if (!near || room > near.room || (room === near.room && gap < near.gap)) near = { at: p, room, gap };
    }
  }
  return (near ?? closest)?.at ?? spot;
}
export function createExitRings(world) {
  const { THREE, geometry: g } = world,
    links = world.registry?.links?.(world.areaId) ?? [],
    // An exit that route-guidance already marks with a ring (a sign, or the Central Safehouse side entrance) keeps that one.
    signed = markedTargets(world.layout?.guidance ?? []),
    group = new THREE.Group(),
    rings = [],
    geometry = new THREE.RingGeometry(EXIT_RINGS.inner, EXIT_RINGS.outer, EXIT_RINGS.segments),
    material = new THREE.MeshBasicMaterial({
      color: `#${EXIT_RINGS.colour}`,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
      transparent: true,
      opacity: EXIT_RINGS.opacity,
    });
  // A locked exit keeps its ring, dimmed, so every way out of an area stays visible; the lock message says what opens it.
  const lockedMaterial = material.clone();
  lockedMaterial.color.set(`#${EXIT_RINGS.lockedColour}`);
  lockedMaterial.opacity = EXIT_RINGS.lockedOpacity;
  group.name = "Exit rings"; // text-ok: internal mesh name
  for (const link of links) {
    if (signed.has(link.to)) continue;
    const zone = zoneGround(g, link.condition, EXIT_RINGS.anchor);
    if (!zone) continue;
    const nudge = EXIT_RINGS.offsets[`${world.areaId}>${link.to}`] ?? { x: 0, z: 0 },
      spot = ringSpot(g, { x: zone.x + nudge.x, z: zone.z + nudge.z }, 0),
      at = centredSpot(g, spot, link.condition, EXIT_RINGS.centring),
      mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Exit ring to ${link.to}`; // text-ok: internal mesh name
    mesh.position.copy(world.toRender(at, EXIT_RINGS.height));
    mesh.rotation.x = EXIT_RINGS.flatRotation;
    mesh.scale.setScalar(EXIT_RINGS.scales[`${world.areaId}>${link.to}`] ?? 1); // far, compressed picture areas need a bigger ring
    group.add(mesh);
    rings.push({ to: link.to, mesh, link, at, spot });
  }
  world.group.add(group);
  let disposed = false;
  return {
    group,
    rings,
    // Every ring stays visible; a locked exit (`isOpen(to)` is the game's own gate) shows the dimmed locked look.
    sync(isOpen) {
      for (const r of rings) r.mesh.material = isOpen(r.to) !== false ? material : lockedMaterial;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      geometry.dispose();
      material.dispose();
      lockedMaterial.dispose();
    },
  };
}
