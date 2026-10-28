import { GAME_DATA } from "./game-data.js";
const D = GAME_DATA.chainedPitborn,
  B = D.breakLoose,
  SPAWN = GAME_DATA.markedHunterSpawn,
  TURN = Math.PI * 2, // one full turn in radians
  OFF = new URLSearchParams(globalThis.location?.search ?? "").get(D.offParam) === D.offValue; // read once, the page does not change it
// The chained Pitborn breaks loose (data/chainedPitborn.json `breakLoose`). Walking up to the shackled Pitborn on the Westminster steps
// snaps its chains; after snapSeconds it is a real marked hunter spawned at the nearest clear spot to where it stood, with the ordinary
// hunter fight. It is held to the ordinary hunter gates and first-arrival wait (`allowed`, from stepMarkedHunters), so a new character
// or a freshly dead one is not hunted before arrivalDelay. The state lives on the run object and is never saved: death puts the Pitborn
// back in its chains, and once it is dead the prop stays gone for the run. ?chainedpitborn=0 (the view's off switch) also turns this off.
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
export function stepChainBreak(g, spawn, allowed) {
  const w = g.world,
    marked = w?.markedData;
  if (!marked || !w.geometry || w.areaId !== D.areaId || !chainBreakOn()) return;
  const s = chainBreakState(g);
  if (s.state === "done") return;
  if (!allowed) {
    if (s.state === "snapping") s.state = "chained";
    if (s.state === "chained") return;
  }
  const at = w.geometry.ground(D.at);
  if (s.state === "chained") {
    if (gap(g.player.pos, at) > B.triggerMetres) return;
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
