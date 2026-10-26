import { GAME_DATA } from "./game-data.js";
// The small gold ring route-guidance draws at the East Bridge exit, put at every exit of every area. It marks the exit's own trigger, not
// the road behind it. Presentation only: it never changes a trigger or a travel link. The ring's look is routeGuidance.marker.ring.
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
// The painting's ground only exists below its horizon: try the zone centre, then its corners.
function zoneGround(g, c) {
  const centre = { x: ((c.xMin ?? 0) + (c.xMax ?? 1)) / 2, y: ((c.yMin ?? 0) + (c.yMax ?? 1)) / 2 }, // tuning-ok: midpoint
    tries = [centre, ...[c.xMin ?? 0, c.xMax ?? 1].flatMap((x) => [c.yMin ?? 0, c.yMax ?? 1].map((y) => ({ x, y })))];
  for (const p of tries) {
    try {
      return g.ground(p);
    } catch {
      /* above the horizon: try the next point */
    }
  }
  return null;
}
// The zone's own ground when it stands clear; otherwise the first clear step from it towards the road, and from the road's edge
// inwards (towards the road's middle) when the zone lies wholly off the road.
export function ringSpot(g, target, radius) {
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
export function createExitRings(world) {
  const { THREE, geometry: g } = world,
    { marker } = GAME_DATA.visual.routeGuidance,
    links = world.registry?.links?.(world.areaId) ?? [],
    // An exit that route-guidance already marks with a ring and sign keeps that one.
    signed = new Set((world.layout?.guidance ?? []).filter((row) => row.sign).map((row) => row.to)),
    group = new THREE.Group(),
    rings = [],
    geometry = new THREE.RingGeometry(marker.ring.inner, marker.ring.outer, marker.ring.segments),
    material = new THREE.MeshBasicMaterial({
      color: `#${marker.ring.colour}`,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
  group.name = "Exit rings";
  for (const link of links) {
    if (signed.has(link.to)) continue;
    const target = zoneGround(g, link.condition);
    if (!target) continue;
    const at = ringSpot(g, target, 0),
      mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Exit ring to ${link.to}`;
    mesh.position.copy(world.toRender(at, marker.height));
    mesh.rotation.x = -Math.PI / 2; // tuning-ok: lay the ring flat
    group.add(mesh);
    rings.push({ to: link.to, mesh, link, at });
  }
  world.group.add(group);
  let disposed = false;
  return {
    group,
    rings,
    // Show a ring only while its exit is open: `isOpen(to)` is the game's own gate.
    sync(isOpen) {
      for (const r of rings) r.mesh.visible = isOpen(r.to) !== false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
