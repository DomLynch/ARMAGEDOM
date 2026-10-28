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
function struck(g, at) {
  const p = g.player,
    cone = Math.cos((GAME_DATA.weapons.targeting.meleeConeDegrees * Math.PI) / 180);
  return g.events.some((e) => {
    if (e.type === "attack" && e.actor === p) {
      const dx = at.x - p.pos.x,
        dz = at.z - p.pos.z,
        d = Math.hypot(dx, dz);
      return d <= B.meleeReachMetres && d > 0 && (dx * p.facing.x + dz * p.facing.z) / d >= cone;
    }
    if (e.type !== "shot" || !e.origin || !e.end || (e.actor && e.actor !== p) || gap(e.origin, p.pos) > B.hitOriginMetres) return false;
    const sx = e.end.x - e.origin.x,
      sz = e.end.z - e.origin.z,
      length = sx * sx + sz * sz,
      t = length ? Math.max(0, Math.min(1, ((at.x - e.origin.x) * sx + (at.z - e.origin.z) * sz) / length)) : 0;
    return gap({ x: e.origin.x + sx * t, z: e.origin.z + sz * t }, at) <= B.hitRadiusMetres;
  });
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
