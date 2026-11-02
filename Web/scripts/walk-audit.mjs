// Walkability audit from data: for each area, can the character walk from the area's entry to every exit zone, and where are the
// narrowest places on the way? Uses the game's own geometry (world-geometry.js: road polygon minus blockers, the wall margin) and the
// character's radius from visual.json worldGeometry. Dev tool and test helper; never imported by the game.
//   node scripts/walk-audit.mjs            prints a markdown report for every area
// A cell is walkable when geometry.clear(cell, radius) is true. Clearance is the largest radius a capsule centred on the cell could have:
// the distance to the nearest road or blocker edge minus the wall margin. The best route to a cell is the one whose tightest point is
// widest (a max-min search), so "choke" means the tightest point on the best route, not on some route nobody would walk.
import { readFileSync } from "node:fs";
import { createAreaRegistry } from "../src/area-registry.js";
import { createGeometry, insidePolygon } from "../src/world-geometry.js";
import { WORLD_GEOMETRY } from "../src/engine/world-geometry-data.js";

const read = (p) => JSON.parse(readFileSync(new URL(`../public/${p}`, import.meta.url)));
export const GRID = { columns: 6, rows: 4 }; // the A1-F4 grid on the area maps page: columns A-F left to right, rows 1-4 top to bottom
export const CELL = 0.15; // metres between audit samples
export const MIN_POCKET_M2 = 1; // a sealed pocket smaller than this is sampling noise
const NEIGHBOURS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];
const inZone = (condition, pt) =>
  Object.entries(condition).every(([k, v]) => (k === "xMin" ? pt.x > v : k === "xMax" ? pt.x < v : k === "yMin" ? pt.y > v : pt.y < v));
export const gridLabel = (pt) =>
  `${String.fromCharCode(65 + Math.min(GRID.columns - 1, Math.max(0, Math.floor(pt.x * GRID.columns))))}${
    Math.min(GRID.rows - 1, Math.max(0, Math.floor(pt.y * GRID.rows))) + 1
  }`;
const segmentDistance = (p, a, b) => {
  const x = b.x - a.x,
    z = b.z - a.z,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.z - a.z) * z) / (x * x + z * z)));
  return Math.hypot(p.x - a.x - t * x, p.z - a.z - t * z);
};

export function loadAreas() {
  const registry = createAreaRegistry({ manifest: read("world/manifest.json") });
  return { registry, ids: [...registry.ids] };
}

// `layout` replaces the area's layout.json (a test edits a copy to prove the audit notices a blocked road).
export function auditArea(registry, areaId, { radius = WORLD_GEOMETRY.defaultRadius, cell = CELL, layout = null } = {}) {
  const area = registry.get(areaId),
    g = createGeometry(layout ?? read(registry.asset(area.layoutRef).path)),
    xs = g.road.map((p) => p.x),
    zs = g.road.map((p) => p.z),
    x0 = Math.min(...xs),
    z0 = Math.min(...zs),
    width = Math.ceil((Math.max(...xs) - x0) / cell) + 1,
    depth = Math.ceil((Math.max(...zs) - z0) / cell) + 1,
    at = (ix, iz) => ({ x: x0 + ix * cell, z: z0 + iz * cell }),
    index = (p) => {
      const ix = Math.round((p.x - x0) / cell),
        iz = Math.round((p.z - z0) / cell);
      return ix >= 0 && iz >= 0 && ix < width && iz < depth ? iz * width + ix : -1;
    },
    clearance = new Float32Array(width * depth).fill(-1),
    inside = (p) => insidePolygon(p, g.road) && !g.blockers.some((poly) => insidePolygon(p, poly));
  for (let iz = 0; iz < depth; iz++)
    for (let ix = 0; ix < width; ix++) {
      const p = at(ix, iz);
      if (!inside(p)) continue;
      let nearest = Infinity;
      for (const [a, b] of g.edges) nearest = Math.min(nearest, segmentDistance(p, a, b));
      clearance[iz * width + ix] = nearest - WORLD_GEOMETRY.wallMargin;
    }
  // Max-min search from the entry: best[i] is the widest tightest-point of any route from the entry to cell i.
  const start = index(g.ground(area.entry)),
    best = new Float32Array(width * depth).fill(-1),
    from = new Int32Array(width * depth).fill(-1),
    heap = [];
  const push = (i) => {
    heap.push(i);
    let k = heap.length - 1;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (best[heap[parent]] >= best[heap[k]]) break;
      [heap[parent], heap[k]] = [heap[k], heap[parent]];
      k = parent;
    }
  };
  const pop = () => {
    const top = heap[0],
      last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1,
          r = l + 1;
        let m = k;
        if (l < heap.length && best[heap[l]] > best[heap[m]]) m = l;
        if (r < heap.length && best[heap[r]] > best[heap[m]]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  if (start >= 0 && clearance[start] > 0) {
    best[start] = clearance[start];
    push(start);
  }
  const done = new Uint8Array(width * depth);
  while (heap.length) {
    const i = pop();
    if (done[i]) continue;
    done[i] = 1;
    const ix = i % width,
      iz = (i - ix) / width;
    for (const [dx, dz] of NEIGHBOURS) {
      const jx = ix + dx,
        jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= width || jz >= depth) continue;
      const j = jz * width + jx;
      if (done[j] || clearance[j] <= 0) continue;
      const through = Math.min(best[i], clearance[j]);
      if (through > best[j]) {
        best[j] = through;
        from[j] = i;
        push(j);
      }
    }
  }
  const cells = (list) => list.map((i) => ({ ...at(i % width, (i - (i % width)) / width) })),
    label = (i) => gridLabel(g.point(at(i % width, (i - (i % width)) / width))),
    routeTo = (i) => {
      const out = [];
      for (let k = i; k >= 0; k = from[k]) out.push(k);
      return out;
    };
  // Exit zones: walkable cells whose picture position lies inside the link's rectangle (the game's own travelAt test).
  const exits = registry.links(areaId).map((link) => {
    let target = -1;
    const zone = new Uint8Array(best.length);
    for (let i = 0; i < best.length; i++) {
      if (clearance[i] <= 0 || !inZone(link.condition, g.point(at(i % width, (i - (i % width)) / width)))) continue;
      zone[i] = 1;
      if (target < 0 || best[i] > best[target]) target = i;
    }
    // Standable depth of the trigger strip: how far inside the zone the character's centre can get (a spot it fits on, reachable from
    // the entry), measured from the nearest walkable ground outside the zone. A strip a few centimetres deep is easy to miss.
    const outside = new Float32Array(best.length).fill(Infinity);
    for (let i = 0; i < best.length; i++) if (clearance[i] > 0 && !zone[i]) outside[i] = 0;
    const relax = (i, j, step) => {
      if (outside[j] + step < outside[i]) outside[i] = outside[j] + step;
    };
    for (let iz = 0; iz < depth; iz++)
      for (let ix = 0; ix < width; ix++)
        for (const [dx, dz, step] of NEIGHBOURS.slice(0, 8).filter(([a, b]) => b < 0 || (b === 0 && a < 0)))
          if (ix + dx >= 0 && ix + dx < width && iz + dz >= 0) relax(iz * width + ix, (iz + dz) * width + ix + dx, step * cell);
    for (let iz = depth - 1; iz >= 0; iz--)
      for (let ix = width - 1; ix >= 0; ix--)
        for (const [dx, dz, step] of NEIGHBOURS.filter(([a, b]) => b > 0 || (b === 0 && a > 0)))
          if (ix + dx >= 0 && ix + dx < width && iz + dz < depth) relax(iz * width + ix, (iz + dz) * width + ix + dx, step * cell);
    let stripDepth = 0;
    for (let i = 0; i < best.length; i++) if (zone[i] && best[i] > radius && Number.isFinite(outside[i])) stripDepth = Math.max(stripDepth, outside[i]);
    const reachable = target >= 0 && best[target] > radius,
      // The exit fires when the character steps into the zone, so the route that counts runs from the entry to the first zone cell.
      // Ground inside the zone is not a corridor: a zone against the picture's edge is shallow by nature.
      full = reachable ? routeTo(target).reverse() : [],
      enter = full.findIndex((i) => inZone(link.condition, g.point(at(i % width, (i - (i % width)) / width)))),
      route = enter >= 0 ? full.slice(0, enter + 1) : full;
    return {
      to: link.to,
      reachable,
      stripDepth, // metres: the deepest the character's centre can stand inside the exit zone
      widestRoute: reachable ? 2 * Math.min(...route.map((i) => clearance[i])) : 0, // metres at the tightest point before the zone
      cell: route.length ? label(route.at(-1)) : null,
      route,
    };
  });
  // Where players arrive from other areas must be walkable and joined to the entry too.
  const arrivals = [...registry.ids]
    .flatMap((from) => registry.links(from).filter((l) => l.to === areaId))
    .map((link) => {
      const p = g.ground(link.entry),
        i = index(p),
        ix = i % width,
        iz = (i - ix) / width,
        // A sample cell can miss a point that is clear; look at the cell and its eight neighbours.
        near = NEIGHBOURS.map(([dx, dz]) => (iz + dz) * width + ix + dx).concat(i).filter((k) => k >= 0 && k < best.length);
      return {
        from: link.from,
        id: link.id,
        reachable: i >= 0 && near.some((k) => best[k] > radius),
        clearHere: g.clear(p, radius),
        cell: gridLabel(g.point(p)),
      };
    });
  // The three tightest points on the routes to the exits, at least `apart` metres from each other.
  const apart = 2,
    onRoute = new Set(exits.flatMap((e) => e.route)),
    ordered = [...onRoute].sort((a, b) => clearance[a] - clearance[b]),
    chokes = [];
  for (const i of ordered) {
    const p = at(i % width, (i - (i % width)) / width);
    if (chokes.every((c) => Math.hypot(c.p.x - p.x, c.p.z - p.z) >= apart)) chokes.push({ p, width: 2 * clearance[i], cell: label(i) });
    if (chokes.length === 3) break;
  }
  // Walkable cells the entry cannot reach (pockets sealed off by blockers), counted per map grid cell.
  const counted = {};
  for (let i = 0; i < best.length; i++)
    if (clearance[i] > radius && best[i] <= radius) {
      const key = label(i);
      counted[key] = (counted[key] ?? 0) + 1;
    }
  // Sampling leaves a speck or two at tight corners; only a pocket of a square metre or more is a finding.
  const pockets = Object.fromEntries(Object.entries(counted).filter(([, n]) => n * cell * cell >= MIN_POCKET_M2));
  return {
    areaId,
    radius,
    pockets,
    exits: exits.map(({ route, ...e }) => e),
    arrivals,
    // `at` is the ground point in metres and `picture` the same spot as image fractions, for finding the edges that make the choke.
    chokes: chokes.map(({ p, width: w, cell: c }) => ({ width: w, cell: c, at: p, picture: g.point(p) })),
    walkableShare: cells([...best.keys()].filter((i) => best[i] > radius)).length / Math.max(1, clearance.filter((c) => c > radius).length),
  };
}

export function report() {
  const { registry, ids } = loadAreas(),
    radius = WORLD_GEOMETRY.defaultRadius,
    out = [
      `# Walkability audit`,
      ``,
      `Character radius ${radius} m (diameter ${2 * radius} m), sampled every ${CELL} m, grid ${GRID.columns} columns A-F by ${GRID.rows} rows.`,
      ``,
    ];
  for (const id of ids) {
    const r = auditArea(registry, id);
    out.push(`## ${id}`);
    for (const e of r.exits)
      out.push(`- exit to ${e.to}: ${e.reachable ? "reachable" : "NOT REACHABLE"}, tightest point on the best route ${e.widestRoute.toFixed(2)} m wide`);
    for (const a of r.arrivals.filter((x) => !x.reachable)) out.push(`- arrival from ${a.from} (${a.id}) is NOT joined to the entry`);
    for (const [cellName, n] of Object.entries(r.pockets))
      out.push(`- sealed pocket in ${cellName}: ${n} sample cells (${(n * CELL * CELL).toFixed(1)} m2) the entry cannot reach`);
    out.push(`- tightest three: ${r.chokes.map((c) => `${c.cell} ${c.width.toFixed(2)} m`).join(", ")}`, ``);
  }
  return out.join("\n");
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) console.log(report());
