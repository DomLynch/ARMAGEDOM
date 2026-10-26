import { GAME_DATA } from "./game-data.js";
import { EXIT_ARROWS } from "./exit-arrows-data.js";
// One faint yellow ground arrow at each exit of an area, pointing out through it. Presentation only: it never changes a trigger or a
// travel link. Positions come from the registry link conditions (rectangles in painting fractions); the arrow's look is route-guidance's.
const edgeDirections = [
  ["xMin", { x: 1, z: 0 }],
  ["xMax", { x: -1, z: 0 }],
  ["yMax", { x: 0, z: 1 }], // top of the painting is farther from the camera
  ["yMin", { x: 0, z: -1 }],
];
const unit = (x, z) => {
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
};
// The zone's centre in painting fractions; a side the condition leaves open runs to the painting's edge.
export function zoneCentre(c) {
  return { x: ((c.xMin ?? 0) + (c.xMax ?? 1)) / 2, y: ((c.yMin ?? 0) + (c.yMax ?? 1)) / 2 }; // tuning-ok: midpoint
}
// Which way "out" is: a zone against a painting edge points out through that edge, any other zone points from the road's middle
// towards it. `centre` is the road's middle and `target` the zone's ground point, both in metres.
export function exitDirection(c, band, centre, target) {
  for (const [key, dir] of edgeDirections) {
    const edge = key === "xMin" || key === "yMin" ? c[key] >= 1 - band : c[key] <= band && c[key] !== undefined;
    if (edge) return dir;
  }
  return unit(target.x - centre.x, target.z - centre.z);
}
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
  const centre = zoneCentre(c),
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
export function createExitArrows(world) {
  const { THREE, geometry: g } = world,
    links = world.registry?.links?.(world.areaId) ?? [],
    shape = GAME_DATA.visual.routeGuidance.arrow,
    tipLength = Math.max(...shape.triangles.flat().map((p) => p[2])) * EXIT_ARROWS.lengthScale,
    group = new THREE.Group(),
    arrows = [],
    geometry = new THREE.BufferGeometry(),
    material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(`#${GAME_DATA.visual.dropMarker.ringColour}`),
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
      transparent: true,
      opacity: EXIT_ARROWS.opacity,
    }),
    middle = g.road.reduce((s, p) => ({ x: s.x + p.x / g.road.length, z: s.z + p.z / g.road.length }), { x: 0, z: 0 });
  group.name = "Exit arrows";
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(shape.triangles.flat(2), 3)); // tuning-ok: x, y, z per vertex
  // Back from the road's edge by the arrow's length and a little more, then further in until the whole arrow stands on clear ground.
  const { sampleStep } = GAME_DATA.visual.routeGuidance;
  function alongClear(road, dir, inset) {
    for (let back = tipLength + inset; back <= tipLength + EXIT_ARROWS.searchMetres; back += sampleStep) {
      const tail = { x: road.x - dir.x * back, z: road.z - dir.z * back },
        tip = { x: tail.x + dir.x * tipLength, z: tail.z + dir.z * tipLength };
      if (g.clear(tail, 0) && g.clear(tip, 0)) return tail;
    }
    return null;
  }
  // Keep the wanted direction when the arrow fits; otherwise turn it the least that lets it stand on clear ground.
  function fit(road, wanted, inset) {
    const turn = (Math.PI * 2) / EXIT_ARROWS.directionSteps; // tuning-ok: full circle
    for (let k = 0; k <= EXIT_ARROWS.directionSteps / 2; k++) // tuning-ok: either side of the wanted direction
      for (const sign of k ? [1, -1] : [1]) {
        const angle = sign * k * turn,
          dir = {
            x: wanted.x * Math.cos(angle) - wanted.z * Math.sin(angle),
            z: wanted.x * Math.sin(angle) + wanted.z * Math.cos(angle),
          },
          tail = alongClear(road, dir, inset);
        if (tail) return { tail, dir };
      }
    return { tail: { x: road.x - wanted.x * tipLength, z: road.z - wanted.z * tipLength }, dir: wanted };
  }
  for (const link of links) {
    const target = zoneGround(g, link.condition);
    if (!target) continue;
    const road = nearestOnRoad(g.road, target),
      // An exit on the painting's bottom edge sits further in, so its arrow clears the touch controls.
      inset = link.condition.yMin >= 1 - EXIT_ARROWS.edgeBand ? EXIT_ARROWS.bottomEdgeInset : EXIT_ARROWS.roadInset,
      { tail, dir } = fit(road, exitDirection(link.condition, EXIT_ARROWS.edgeBand, middle, target), inset),
      mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Exit arrow to ${link.to}`;
    mesh.position.copy(world.toRender(tail, shape.height));
    mesh.rotation.y = Math.atan2(dir.x, -dir.z);
    mesh.scale.set(EXIT_ARROWS.widthScale, 1, EXIT_ARROWS.lengthScale);
    group.add(mesh);
    arrows.push({ to: link.to, mesh, link });
  }
  world.group.add(group);
  let disposed = false;
  return {
    group,
    arrows,
    // Show an arrow only while its exit is open: `isOpen(to)` is the game's own gate.
    sync(isOpen) {
      for (const a of arrows) a.mesh.visible = isOpen(a.to) !== false;
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
