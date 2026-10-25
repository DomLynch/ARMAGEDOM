// Headless exit-walk probe: from many start cells around an exit, walk straight at the exit trigger with the real geometry.move
// (the same call the game makes each step) and report which starts stall short of the trigger and where. Usage:
//   node scripts/exit-probe.mjs <area> <toArea> [radiusMetres=18]
import { readFileSync } from "node:fs";
import { createAreaRegistry } from "../src/area-registry.js";
import { createGeometry } from "../src/world-geometry.js";

const RADIUS = 0.4,
  STEP = 0.07,
  CELL = 0.5;
const read = (p) => JSON.parse(readFileSync(new URL("../public/" + p, import.meta.url)));
const registry = createAreaRegistry({ manifest: read("world/manifest.json") });
export const inLink = (link, pt) =>
  Object.entries(link.condition).every(([k, v]) =>
    k === "xMin" ? pt.x > v : k === "xMax" ? pt.x < v : k === "yMin" ? pt.y > v : pt.y < v,
  );

export function probe(areaId, toId, reach = 18) {
  const area = registry.get(areaId),
    geo = createGeometry(read(registry.asset(area.layoutRef).path)),
    link = registry.links(areaId).find((l) => l.to === toId);
  // Trigger cells: walkable ground inside the link rectangle.
  const xs = geo.road.map((p) => p.x),
    zs = geo.road.map((p) => p.z);
  const x0 = Math.min(...xs),
    z0 = Math.min(...zs),
    x1 = Math.max(...xs),
    z1 = Math.max(...zs);
  const trigger = [],
    starts = [];
  for (let x = x0; x <= x1; x += 0.1)
    for (let z = z0; z <= z1; z += 0.1) {
      const p = { x, z };
      if (!geo.clear(p, RADIUS)) continue;
      if (inLink(link, geo.point(p))) trigger.push(p);
    }
  if (!trigger.length) return { areaId, toId, trigger: 0, starts: 0, stalled: [] };
  const cx = trigger.reduce((n, p) => n + p.x, 0) / trigger.length,
    cz = trigger.reduce((n, p) => n + p.z, 0) / trigger.length;
  const nearest = (p) => trigger.reduce((b, t) => (Math.hypot(t.x - p.x, t.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? t : b));
  for (let x = x0; x <= x1; x += CELL)
    for (let z = z0; z <= z1; z += CELL) {
      const p = { x, z };
      if (Math.hypot(p.x - cx, p.z - cz) <= reach && geo.clear(p, RADIUS) && !inLink(link, geo.point(p))) starts.push(p);
    }
  const stalled = [];
  let reached = 0;
  for (const s of starts) {
    let pos = { ...s },
      done = false,
      still = 0;
    for (let i = 0; i < 1200 && !done; i++) {
      const goal = nearest(pos),
        d = Math.hypot(goal.x - pos.x, goal.z - pos.z) || 1,
        next = geo.move(pos, { x: ((goal.x - pos.x) / d) * STEP, z: ((goal.z - pos.z) / d) * STEP }, RADIUS);
      if (Math.hypot(next.x - pos.x, next.z - pos.z) < STEP * 0.05) {
        if (++still > 5) break;
      } else still = 0;
      pos = next;
      done = inLink(link, geo.point(pos));
    }
    if (done) reached++;
    else stalled.push({ from: s, stuckAt: pos, distToTrigger: +Math.hypot(nearest(pos).x - pos.x, nearest(pos).z - pos.z).toFixed(2) });
  }
  return { areaId, toId, trigger: trigger.length, starts: starts.length, reached, stalled, centre: { x: cx, z: cz }, geo, link };
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  const [, , area, to, reach = "18"] = process.argv;
  const { geo, link, ...r } = probe(area, to, Number(reach));
  console.log(JSON.stringify({ ...r, stalled: r.stalled.length, sampleStalled: r.stalled.slice(0, 12) }, null, 1));
}
