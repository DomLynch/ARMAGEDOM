// Presence's per-area rules, pure and I/O-free: the rows World generates (Web/scripts/area-presence-rows.mjs, PR #54) loaded and
// validated, then the three questions presence asks of them: is this MOVE plausible, is this TRAVEL allowed, which ARRIVAL does a
// newcomer get. These are sanity checks, not collision authority: the phone moves itself; presence only refuses what could not happen.
// All coordinates are integer centimetres, absolute, in the area's own frame (x right, z forward), as arma_character_location stores them.
import { createHash } from "node:crypto";

const AREA_ID = /^[a-z][a-z0-9.-]{0,31}$/;
const LIMIT = 100000; // arma_character_location: x, z between -100000 and 100000
const isCm = (n) => Number.isInteger(n) && Math.abs(n) <= LIMIT;
const isPoint = (p) => p !== null && typeof p === "object" && isCm(p.x) && isCm(p.z);
const isPolygon = (poly) => Array.isArray(poly) && poly.length >= 3 && poly.every(isPoint);
const fail = (where, why) => {
  throw new Error(`area rows: ${where}: ${why}`);
};

/** Ray casting; a point exactly on an edge counts as inside (a sanity check should not refuse the boundary). */
export function inPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    if (cross === 0 && Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.z, b.z) <= p.z && p.z <= Math.max(a.z, b.z)) return true;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Load the generated rows. Refuses anything malformed instead of defaulting it: bad ids, non-integer or out-of-range centimetres,
 * polygons under three points, duplicate areas/arrivals/enemies, exits to unknown areas, arrivals outside 2..4 per area.
 * Returns { areas: { [id]: row }, version } where version is a hash of the rows, to log which layout presence ran.
 */
export function loadAreaRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) fail("rows", "expected a non-empty array");
  const areas = Object.create(null);
  for (const row of rows) {
    const id = row?.area;
    if (typeof id !== "string" || !AREA_ID.test(id)) fail(JSON.stringify(id), "bad area id");
    if (id in areas) fail(id, "duplicate area");
    const b = row.bounds;
    if (!b || !isCm(b.minX) || !isCm(b.maxX) || !isCm(b.minZ) || !isCm(b.maxZ) || b.minX >= b.maxX || b.minZ >= b.maxZ) fail(id, "bad bounds");
    if (!isPolygon(row.road)) fail(id, "bad road polygon");
    if (!Array.isArray(row.blockers) || !row.blockers.every(isPolygon)) fail(id, "bad blocker polygon");
    if (!isCm(row.playerRadiusCm) || row.playerRadiusCm <= 0) fail(id, "bad playerRadiusCm");
    if (!Array.isArray(row.exits) || !Array.isArray(row.arrivals) || !Array.isArray(row.enemies)) fail(id, "exits, arrivals and enemies must be arrays");
    areas[id] = row;
  }
  const seenInstances = new Set();
  for (const [id, row] of Object.entries(areas)) {
    for (const exit of row.exits) {
      if (typeof exit.to !== "string" || !(exit.to in areas) || exit.to === id) fail(id, `exit to unknown or same area ${JSON.stringify(exit.to)}`);
      if (!isPolygon(exit.zone)) fail(id, `exit to ${exit.to}: bad zone polygon`);
    }
    if (row.arrivals.length < 2 || row.arrivals.length > 4) fail(id, `${row.arrivals.length} arrivals, expected 2 to 4`);
    const arrivalIds = new Set();
    for (const a of row.arrivals) {
      if (typeof a.id !== "string" || !a.id.startsWith(id + ":") || arrivalIds.has(a.id)) fail(id, `bad or duplicate arrival id ${JSON.stringify(a.id)}`);
      arrivalIds.add(a.id);
      if (!isPoint(a)) fail(id, `arrival ${a.id}: bad position`);
      if (a.from !== null && (typeof a.from !== "string" || !(a.from in areas))) fail(id, `arrival ${a.id}: unknown from ${JSON.stringify(a.from)}`);
      if (!isWalkable(row, a)) fail(id, `arrival ${a.id} is not on the road or is inside a blocker`);
    }
    for (const e of row.enemies) {
      if (typeof e.instance !== "string" || seenInstances.has(e.instance) || !isPoint(e.home)) fail(id, `bad or duplicate enemy ${JSON.stringify(e.instance)}`);
      seenInstances.add(e.instance);
    }
  }
  const version = createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 16);
  return { areas, version };
}

const inBounds = (area, p) => p.x >= area.bounds.minX && p.x <= area.bounds.maxX && p.z >= area.bounds.minZ && p.z <= area.bounds.maxZ;

/** On the road polygon and inside no blocker polygon. */
export function isWalkable(area, p) {
  return inBounds(area, p) && inPolygon(p, area.road) && !area.blockers.some((poly) => inPolygon(p, poly));
}

/**
 * Is moving from `prev` to `next` plausible? { x, z, atMs } each. Refuses: a non-integer or out-of-range position, a position off the
 * walkable region, a time that goes backwards, and speed above maxSpeedCmPerS * slack. Elapsed time is floored at minDtMs so two reports
 * a few milliseconds apart (network jitter) cannot make a normal step look like a teleport.
 */
export function checkMove(area, prev, next, { maxSpeedCmPerS, slack = 1.25, minDtMs = 100 }) {
  if (!(maxSpeedCmPerS > 0)) throw new Error("checkMove: maxSpeedCmPerS is required (movement speed is Combat's number, never a default here)");
  if (!isPoint(next)) return { ok: false, reason: "position" };
  if (!isWalkable(area, next)) return { ok: false, reason: inBounds(area, next) ? "blocked" : "bounds" };
  if (!prev) return { ok: true };
  const dtMs = next.atMs - prev.atMs;
  if (!(dtMs >= 0)) return { ok: false, reason: "time" };
  const allowed = (maxSpeedCmPerS * slack * Math.max(dtMs, minDtMs)) / 1000;
  return distance(prev, next) <= allowed ? { ok: true } : { ok: false, reason: "speed" };
}

/** May a player standing at `pos` in `fromArea` travel to `toArea`? Only from inside an exit zone that leads there. */
export function checkTravel(rules, fromArea, toArea, pos) {
  const from = rules.areas[fromArea];
  if (!from || !isPoint(pos)) return false;
  return from.exits.some((exit) => exit.to === toArea && inPolygon(pos, exit.zone));
}

/**
 * Which arrival does a newcomer to `toArea` get? Arrivals reserved for the area they came from (`from === fromArea`) first; if the
 * area has none for that direction (or fromArea is null, a fresh start or resume) every arrival is a candidate. Among candidates, the
 * one farthest from every player already there (`occupied`: [{x,z}]), ties to the lowest id, so the choice is deterministic.
 */
export function pickArrival(rules, toArea, fromArea, occupied = []) {
  const area = rules.areas[toArea];
  if (!area) throw new Error(`pickArrival: unknown area ${JSON.stringify(toArea)}`);
  const direct = fromArea ? area.arrivals.filter((a) => a.from === fromArea) : [];
  const candidates = direct.length ? direct : area.arrivals;
  const room = (a) => occupied.reduce((least, o) => Math.min(least, distance(a, o)), Infinity);
  return [...candidates].sort((a, b) => room(b) - room(a) || (a.id < b.id ? -1 : 1))[0];
}

/** A saved location is trusted only if it is walkable; otherwise the player resumes at the nearest arrival. */
export function resumePosition(rules, areaId, saved) {
  const area = rules.areas[areaId];
  if (!area) return null;
  if (isPoint(saved) && isWalkable(area, saved)) return { x: saved.x, z: saved.z, arrival: null };
  const from = isPoint(saved) ? saved : { x: 0, z: 0 };
  const near = [...area.arrivals].sort((a, b) => distance(a, from) - distance(b, from) || (a.id < b.id ? -1 : 1))[0];
  return { x: near.x, z: near.z, arrival: near.id };
}
