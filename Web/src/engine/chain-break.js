import { GAME_DATA } from "./game-data.js";
const D = GAME_DATA.chainedPitborn,
  B = D.breakLoose,
  SPAWN = GAME_DATA.markedHunterSpawn,
  TURN = Math.PI + Math.PI, // one full turn in radians
  OFF = new URLSearchParams(globalThis.location?.search ?? "").get(D.offParam) === D.offValue; // read once, the page does not change it
// The chained Pitborn breaks loose (data/chainedPitborn.json `breakLoose`). It stays shackled on the Westminster steps until the player
// shoots or strikes it (never by walking up): the chains snap, and after snapSeconds it is a real marked hunter spawned at the nearest clear
// spot to where it stood, with the ordinary hunter fight. A finished run, an invalid run save or a safehouse block it like any hunter; the
// arrival wait and the bounty gate do not, so a new player who shoots it gets the fight. The state lives on the run object and is never
// saved: death puts the Pitborn back in its chains, and once it is dead the prop stays gone for the run. ?chainedpitborn=0 turns this off.
export const chainBreakOn = () => D.enabled && B.enabled && !OFF;
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function chainBreakState(g) {
  return (g.chainBreak ??= { state: "chained", at: 0, actor: null });
}
function notify(g, text) {
  g.message = text;
  g.messageUntil = g.time + B.messageSeconds;
}
// The prop stands where a 0.4 m body may clip scenery: take the point itself if it is clear, else the nearest clear one on rings out
// to clearSearchMetres.
function clearSpot(geometry, at) {
  if (geometry.clear(at, SPAWN.bodyRadius)) return at;
  for (let r = B.clearStepMetres; r <= B.clearSearchMetres; r += B.clearStepMetres)
    for (let k = 0; k < B.clearDirections; k++) {
      const a = (k / B.clearDirections) * TURN,
        p = { x: at.x + Math.cos(a) * r, z: at.z + Math.sin(a) * r };
      if (geometry.clear(p, SPAWN.bodyRadius)) return p;
    }
  return null;
}
// The chained Pitborn takes no damage; a shot or a swing aimed at it this tick is what snaps the chains. A pistol or rifle shot counts when its
// path passes within hitRadiusMetres of it (the shot does not stop there: it is not an enemy yet), a swing when it is within meleeReachMetres
// and inside the melee targeting cone.
// Which event types count is data (`chainedTargets`): rays (pistol, rifle, shotgun pellets; rays3d the arc gun), melee swings and the saw, blasts (rocket,
// grenade, trap crate: within the blast radius plus blastPaddingMetres, whoever set them off) and flame cones (the ember projector).
// Any weapon that emits one of these events breaks the chains without being an enemy.
const T = D.chainedTargets;
function nearRay(r, at) {
  const sx = r.end.x - r.origin.x,
    sz = r.end.z - r.origin.z,
    length = sx * sx + sz * sz,
    t = length ? Math.max(0, Math.min(1, ((at.x - r.origin.x) * sx + (at.z - r.origin.z) * sz) / length)) : 0;
  return gap({ x: r.origin.x + sx * t, z: r.origin.z + sz * t }, at) <= B.hitRadiusMetres;
}
function edgeGap(p, a, b) {
  const sx = b.x - a.x,
    sz = b.z - a.z,
    length = sx * sx + sz * sz,
    t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * sx + (p.z - a.z) * sz) / length)) : 0;
  return gap(p, { x: a.x + sx * t, z: a.z + sz * t });
}
const polygonGap = (p, poly) => Math.min(...poly.map((a, i) => edgeGap(p, a, poly[(i + 1) % poly.length])));
// The Pitborn stands inside the lion statue's collision (the blocker polygon nearest its spot), which stops a bullet short of it. While its
// own spot is blocked scenery, a bullet whose stop point is on that polygon's edge (within coverEdgeMetres) still counts when the line it
// was fired along passes within hitRadiusMetres of the Pitborn. A bullet stopped by any other wall, crate or enemy does not.
const onStatue = (geometry, at, p) => {
  if (geometry.clear(at, SPAWN.bodyRadius)) return false;
  const statue = geometry.blockers?.reduce((best, poly) => (!best || polygonGap(at, poly) < polygonGap(at, best) ? poly : best), null);
  return !!statue && polygonGap(p, statue) <= T.coverEdgeMetres;
};
// Sight from a to the Pitborn's spot, where the only thing in the way is the statue it stands in: walk the line to the first blocked point
// and ask whether that point is the statue's edge. Any other wall on the way keeps the sight blocked.
export function sightPastStatue(geometry, at, a) {
  if (!geometry.lineClear(a, a)) return false;
  let low = 0,
    high = 1;
  const point = (t) => ({ x: a.x + (at.x - a.x) * t, z: a.z + (at.z - a.z) * t });
  for (let i = 0; i < 20; i++) { // tuning-ok: twenty halvings pin the first blocked point to a millionth of the line
    const middle = (low + high) / 2; // tuning-ok: bisection takes the midpoint
    if (geometry.lineClear(a, point(middle))) low = middle;
    else high = middle;
  }
  return onStatue(geometry, at, point(low));
}
function behindCover(r, e, at, geometry) {
  if (!onStatue(geometry, at, r.end)) return false;
  const dir = r.direction ?? e.direction ?? { x: r.end.x - r.origin.x, z: r.end.z - r.origin.z },
    len = Math.hypot(dir.x, dir.z),
    dx = at.x - r.origin.x,
    dz = at.z - r.origin.z,
    along = len ? (dx * dir.x + dz * dir.z) / len : 0;
  return along > 0 && Math.abs(dx * dir.z - dz * dir.x) / len <= B.hitRadiusMetres;
}
function inCone(e, at) {
  const dx = at.x - e.origin.x,
    dz = at.z - e.origin.z,
    d = Math.hypot(dx, dz),
    half = (e.coneDegrees * Math.PI) / 360 + Math.asin(Math.min(1, B.hitRadiusMetres / Math.max(d, B.hitRadiusMetres)));
  if (d > e.range + B.hitRadiusMetres) return false;
  const len = Math.hypot(e.direction.x, e.direction.z);
  return d === 0 || (len > 0 && (dx * e.direction.x + dz * e.direction.z) / (d * len) >= Math.cos(half));
}
function struck(g, at) {
  const p = g.player,
    cone = Math.cos((GAME_DATA.weapons.targeting.meleeConeDegrees * Math.PI) / 180);
  return g.events.some((e) => {
    if (T.blasts.includes(e.type)) return !!e.position && gap(e.position, at) <= (e.radius ?? 0) + T.blastPaddingMetres;
    if (e.actor && e.actor !== p) return false;
    if (T.melee.includes(e.type) && e.actor === p) {
      const dx = at.x - p.pos.x,
        dz = at.z - p.pos.z,
        d = Math.hypot(dx, dz);
      return d <= B.meleeReachMetres && d > 0 && (dx * p.facing.x + dz * p.facing.z) / d >= cone;
    }
    if (T.cones.includes(e.type)) return !!e.origin && !!e.direction && inCone(e, at);
    // rays3d events (the arc gun) carry 3D points whose z is the ground z negated.
    const flip = T.rays3d.includes(e.type),
      ground = (q) => (flip ? { x: q.x, z: -q.z } : q);
    if (!(flip || T.rays.includes(e.type)) || !e.origin || gap(ground(e.origin), p.pos) > B.hitOriginMetres) return false;
    // A shotgun event's own origin/end is the unclipped full-range line; only its wall-clipped pellets say where the shot went.
    // Cover applies to a single bullet (pistol, rifle); a clipped shotgun pellet stays stopped by whatever stopped it.
    const bullet = !e.pellets?.length && !flip;
    return (e.pellets?.length ? e.pellets : [e]).some(
      (r) => r.origin && r.end && (nearRay({ origin: ground(r.origin), end: ground(r.end) }, at) || (bullet && behindCover(r, e, at, g.world.geometry))),
    );
  });
}
// The shackled Pitborn as an aim-assist target: auto-aim turns the shot toward it (the first hit then snaps the chains). It is a stand-in,
// never an enemy: no damage, not in g.enemies. Only while it is still chained and the run is in its area.
export function chainedPitbornTarget(g) {
  const w = g.world;
  if (!w?.geometry?.ground || w.areaId !== D.areaId || !chainBreakOn() || (g.chainBreak?.state ?? "chained") !== "chained") return null;
  return { id: T.aimTargetId, pos: w.geometry.ground(D.at), hp: 1, radius: B.hitRadiusMetres, hostile: true, visible: true, areaId: D.areaId };
}
// `open`: no finished run, no invalid run save, not in a safehouse (the arrival wait and the bounty gate do not apply to a hit).
export function stepChainBreak(g, spawn, open) {
  const w = g.world,
    marked = w?.markedData;
  if (!marked || !w.geometry || w.areaId !== D.areaId || !chainBreakOn()) return;
  const s = chainBreakState(g);
  if (s.state === "done") return;
  const at = w.geometry.ground(D.at);
  if (!open) {
    if (s.state === "snapping") s.state = "chained";
    if (s.state === "chained") return;
  }
  if (s.state === "chained") {
    if (!struck(g, at)) return;
    Object.assign(s, { state: "snapping", at: g.time });
    notify(g, B.text.snap);
    g.events.push({ type: "chained-pitborn-snap", position: { ...at } });
    return;
  }
  if (s.state === "snapping") {
    if (g.time < s.at + B.snapSeconds) return;
    // One hunter at a time (marked.maxHunters): wait while another hunter lives.
    const spot = g.enemies.some((e) => e.hp > 0 && e.markedHunter) ? null : clearSpot(w.geometry, at);
    if (!spot) {
      s.at = g.time - B.snapSeconds + B.retrySeconds;
      return;
    }
    const actor = spawn(spot, marked);
    g.enemies.push(actor);
    Object.assign(s, { state: "loose", actor });
    if (g.markedHunt) {
      g.markedHunt.hadHunter = true;
      g.markedHunt.nextSpawnAt = Math.max(g.markedHunt.nextSpawnAt, g.time + marked.spawnCooldown);
    }
    g.events.push({ type: "marked-hunter-arrived", actor, position: { ...spot } });
    notify(g, B.text.loose);
    return;
  }
  // The Pitborn leaves the enemy list when it dies (done) or when travel clears hunters (back in its chains).
  if (s.state === "loose" && !g.enemies.includes(s.actor)) s.state = s.actor.hp <= 0 ? "done" : "chained";
}
