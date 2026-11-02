// Multiplayer area data: one row per registered area, generated from the registered layouts, registry links and
// the shipped spawn rows (never typed by hand). Numbers are integer centimetres in the area's own frame.
//   node scripts/area-presence-rows.mjs [out.json]      (prints the rows to stdout without an argument)
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { KNIFE_RULES } from "../src/donor/knife.js";
import { walkArea, registry, inLink } from "./stuck-walk.mjs";
import { validateAreaMetadata } from "../src/engine/area-content.js";
import { worldSpawnRows } from "../src/engine/world-events.js";
import { AREA_MOB_SPAWNS } from "../src/area-mob-spawns.js";
import { AREA_DRONE_SPAWNS } from "../src/area-drone-spawns.js";

export const PLAYER_RADIUS = 0.4;
// Arrival points: clear of walls by a margin beyond the player radius, apart by three radii so two players
// arriving in the same tick never overlap, and not on top of an exit zone or a resident.
export const ARRIVAL = { margin: 0.5, spacing: 1.2, zonePad: 0.02, residentGap: 3, max: 4, min: 2 };
const SAMPLE_EVERY = 7;

const read = (p) => JSON.parse(readFileSync(new URL("../public/" + p, import.meta.url)));
const cm = (m) => Math.round(m * 100);
const pt = (p) => ({ x: cm(p.x), z: cm(p.z) });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function loadContent() {
  return validateAreaMetadata(read("world/area-content.json"), registry);
}

function exitZone(geo, link) {
  const c = link.condition,
    [x0, x1, y0, y1] = [c.xMin ?? 0, c.xMax ?? 1, c.yMin ?? 0, c.yMax ?? 1];
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ].map(([x, y]) => pt(geo.ground({ x, y })));
}

function arrivalPoints(area, walk, homes) {
  const { geo, mainCells } = walk,
    paddedIn = (p) => {
      const s = geo.point(p);
      return registry.links(area).some((l) => {
        const c = l.condition,
          pad = ARRIVAL.zonePad,
          widened = {};
        for (const [k, v] of Object.entries(c)) widened[k] = k.endsWith("Min") ? v - pad : v + pad;
        return inLink({ condition: widened }, s);
      });
    },
    ok = (p) => geo.clear(p, ARRIVAL.margin) && walk.inMain(p) && !paddedIn(p),
    far = (p, picked, gap) => picked.every((q) => dist(p, q.at) >= gap);
  const picked = [],
    take = (at, from) => picked.push({ at, from });
  const named = [{ at: geo.ground(registry.get(area).entry), from: null }];
  for (const other of registry.ids)
    for (const l of registry.links(other)) if (l.to === area) named.push({ at: geo.ground(l.entry), from: other });
  for (const n of named)
    if (picked.length < ARRIVAL.max && ok(n.at) && far(n.at, picked, ARRIVAL.spacing)) take(n.at, n.from);
  // Fill up with the free cell farthest from every point so far (and from the residents), deterministic.
  const pool = mainCells.filter((_, i) => i % SAMPLE_EVERY === 0).filter(ok);
  while (picked.length < ARRIVAL.min && pool.length) {
    let best = null,
      bestGap = -1;
    for (const p of pool) {
      if (homes.some((h) => dist(p, h) < ARRIVAL.residentGap)) continue;
      const gap = Math.min(...picked.map((q) => dist(p, q.at)));
      if (gap > bestGap) {
        bestGap = gap;
        best = p;
      }
    }
    if (!best || bestGap < ARRIVAL.spacing) break;
    take(best, null);
  }
  return picked.map((p, i) => ({ id: `${area}:a${i + 1}`, ...pt(p.at), from: p.from }));
}

export function areaPresenceRows(content = loadContent()) {
  const spawns = worldSpawnRows(content),
    geos = new Map();
  const rows = registry.ids.map((area) => {
    const walk = walkArea(area, { dead: false }),
      geo = walk.geo,
      xs = geo.road.map((p) => cm(p.x)),
      zs = geo.road.map((p) => cm(p.z)),
      bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) },
      placed = [...(content.residents?.[area] ?? AREA_MOB_SPAWNS[area] ?? []), ...(AREA_DRONE_SPAWNS[area] ?? [])],
      enemies = spawns
        .filter((s) => s.area === area)
        .map((s) => {
          const key = s.instance.slice(area.length + 1),
            row = placed.find((p) => p.key === key);
          return { instance: s.instance, home: pt(row.pos) };
        });
    geos.set(area, geo);
    return {
      area,
      bounds,
      originCm: { x: bounds.minX, z: bounds.minZ },
      road: geo.road.map(pt),
      blockers: geo.blockers.map((poly) => poly.map(pt)),
      playerRadiusCm: cm(PLAYER_RADIUS),
      exits: registry.links(area).map((l) => {
        const zone = exitZone(geo, l),
          xs = zone.map((p) => p.x),
          zs = zone.map((p) => p.z);
        // rect is the axis-aligned box of the zone; arrival is filled in below once every area has its points.
        return {
          id: l.id,
          to: l.to,
          rect: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) },
          zone,
          arrival: null,
          entry: l.entry,
        };
      }),
      arrivals: arrivalPoints(
        area,
        walk,
        enemies.map((e) => ({ x: e.home.x / 100, z: e.home.z / 100 })),
      ),
      enemies,
    };
  });
  // An area change is accepted only through an exit zone and places the player at the destination's arrival
  // point nearest to where the game itself drops the player (the registry link's entry).
  for (const row of rows)
    for (const exit of row.exits) {
      const dest = rows.find((r) => r.area === exit.to),
        at = pt(geos.get(exit.to).ground(exit.entry));
      exit.arrival = dest.arrivals.reduce((a, b) => (dist(at, b) < dist(at, a) ? b : a)).id;
      delete exit.entry;
    }
  return rows;
}

// The rows plus what presence logs and checks against: a hash of the rows and the player's top speed.
// Top speed is the larger of the run and roll speeds in KNIFE_RULES (knockback and lunges are extra impulses).
export function areaPresenceData(content = loadContent()) {
  const areas = areaPresenceRows(content);
  return {
    version: createHash("sha256").update(JSON.stringify(areas)).digest("hex").slice(0, 16),
    maxSpeedCmPerS: cm(Math.max(KNIFE_RULES.runSpeed, KNIFE_RULES.rollSpeed)),
    areas,
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const json = JSON.stringify(areaPresenceData(), null, 1);
  if (process.argv[2]) writeFileSync(process.argv[2], json + "\n");
  else console.log(json);
}
