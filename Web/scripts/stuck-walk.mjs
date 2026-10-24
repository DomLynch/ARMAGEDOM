// Headless stuck-spot walk: for every registered area, sample the walkable ground, flood-fill it with the real
// geometry.move, and report pockets, dead spots, unreachable links and arrival points that bounce straight back.
import { readFileSync } from "node:fs";
import { createAreaRegistry } from "../src/area-registry.js";
import { createGeometry } from "../src/world-geometry.js";

const RADIUS = 0.4,
  CELL = 0.1,
  STEP = 0.1;
const read = (p) => JSON.parse(readFileSync(new URL("../public/" + p, import.meta.url)));
export const registry = createAreaRegistry({ manifest: read("world/manifest.json") });

export const inLink = (link, pt) =>
  Object.entries(link.condition).every(([k, v]) =>
    k === "xMin" ? pt.x > v : k === "xMax" ? pt.x < v : k === "yMin" ? pt.y > v : pt.y < v,
  );

export function walkArea(areaId) {
  const area = registry.get(areaId),
    geo = createGeometry(read(registry.asset(area.layoutRef).path));
  const xs = geo.road.map((p) => p.x),
    zs = geo.road.map((p) => p.z);
  const x0 = Math.min(...xs),
    z0 = Math.min(...zs),
    nx = Math.ceil((Math.max(...xs) - x0) / CELL) + 1,
    nz = Math.ceil((Math.max(...zs) - z0) / CELL) + 1;
  const pos = (c) => ({ x: x0 + (c % nx) * CELL, z: z0 + Math.floor(c / nx) * CELL });
  const free = new Set();
  for (let c = 0; c < nx * nz; c++) if (geo.clear(pos(c), RADIUS)) free.add(c);
  // Flood fill: a neighbour is connected only when a real move reaches it.
  const comp = new Map(),
    comps = [];
  for (const start of free) {
    if (comp.has(start)) continue;
    const id = comps.length,
      cells = [start];
    comp.set(start, id);
    for (let n = 0; n < cells.length; n++) {
      const c = cells[n],
        i = c % nx,
        j = Math.floor(c / nx);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = i + di,
          nj = j + dj,
          k = nj * nx + ni;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz || !free.has(k) || comp.has(k)) continue;
        const a = pos(c),
          b = pos(k),
          m = geo.move(a, { x: b.x - a.x, z: b.z - a.z }, RADIUS);
        if (Math.hypot(m.x - b.x, m.z - b.z) < 1e-6) {
          comp.set(k, id);
          cells.push(k);
        }
      }
    }
    comps.push(cells);
  }
  // Dead spots: no compass direction moves the player at least half a step.
  const dead = [];
  for (const c of free) {
    const p = pos(c);
    let best = 0;
    for (let a = 0; a < 16; a++) {
      const m = geo.move(p, { x: Math.cos((a * Math.PI) / 8) * STEP, z: Math.sin((a * Math.PI) / 8) * STEP }, RADIUS);
      best = Math.max(best, Math.hypot(m.x - p.x, m.z - p.z));
    }
    if (best < STEP / 2) dead.push({ ...p, screen: geo.point(p), best });
  }
  const entry = geo.ground(area.entry);
  let entryCell = null,
    nearest = CELL * 1.5;
  for (const c of free) {
    const p = pos(c),
      d = Math.hypot(p.x - entry.x, p.z - entry.z);
    if (d < nearest) {
      nearest = d;
      entryCell = c;
    }
  }
  const main = entryCell === null ? -1 : comp.get(entryCell);
  const pockets = comps
    .map((cells, id) => ({ id, size: cells.length, p: pos(cells[0]) }))
    .filter((c) => c.id !== main)
    .map((c) => ({ size: c.size, at: c.p, screen: geo.point(c.p) }));
  const links = registry.links(areaId).map((link) => {
    const cells = [...free].filter((c) => inLink(link, geo.point(pos(c))));
    return {
      to: link.to,
      cells: cells.length,
      inMain: cells.filter((c) => comp.get(c) === main).length,
    };
  });
  const inMain = (g) => {
    let best = null,
      d0 = CELL * 1.5;
    for (const c of free) {
      const p = pos(c),
        d = Math.hypot(p.x - g.x, p.z - g.z);
      if (d < d0) {
        d0 = d;
        best = c;
      }
    }
    return best !== null && comp.get(best) === main;
  };
  return { areaId, geo, inMain, entryFree: entryCell !== null, free: free.size, comps: comps.length, dead, pockets, links };
}

// An arrival point must be clear and outside every exit zone of its own area (else the player bounces back).
export function arrivals(results) {
  const rows = [];
  for (const r of results)
    for (const link of registry.links(r.areaId)) {
      const dest = results.find((x) => x.areaId === link.to),
        g = dest.geo.ground(link.entry),
        bounce = registry.links(link.to).find((l) => inLink(l, dest.geo.point(g)));
      rows.push({
        link: `${r.areaId} -> ${link.to}`,
        clear: dest.geo.clear(g, RADIUS) && dest.inMain(g),
        bounce: bounce?.to ?? null,
      });
    }
  return rows;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const results = registry.ids.map(walkArea);
  for (const r of results) {
    console.log(`\n== ${r.areaId}: free cells ${r.free}, components ${r.comps}, entry free ${r.entryFree}`);
    for (const l of r.links)
      console.log(`  link -> ${l.to}: zone cells ${l.cells}, in main ${l.inMain}${l.inMain ? "" : "  **UNREACHABLE**"}`);
    for (const p of r.pockets)
      console.log(`  pocket ${p.size} cells at screen (${p.screen.x.toFixed(3)}, ${p.screen.y.toFixed(3)})`);
    console.log(`  dead spots: ${r.dead.length}`);
    for (const d of r.dead.slice(0, 8)) console.log(`    screen (${d.screen.x.toFixed(3)}, ${d.screen.y.toFixed(3)})`);
  }
  console.log("\n== arrivals");
  for (const a of arrivals(results))
    console.log(`  ${a.link}: clear ${a.clear}${a.bounce ? `  **BOUNCES to ${a.bounce}**` : ""}`);
}
