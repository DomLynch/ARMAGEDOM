import { GAME_DATA } from "./game-data.js";
import { safehouseTouches } from "./safehouse.js";
const D = GAME_DATA.chainedPitborn,
  B = D.breakLoose;
// The chained Pitborn breaks loose (data/chainedPitborn.json `breakLoose`). Walking up to the shackled Pitborn on the Westminster steps
// snaps its chains; after snapSeconds it is a real marked hunter spawned at the spot it stood, with the ordinary hunter fight and
// bounty rules. The state lives on the run object and is never saved: death puts the Pitborn back in its chains, and once it is dead
// the prop stays gone for the run. ?chainedpitborn=0 (the view's off switch) also turns this off.
export const chainBreakOn = (search = globalThis.location?.search ?? "") =>
  D.enabled && B.enabled && new URLSearchParams(search).get(D.offParam) !== D.offValue;
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function chainBreakState(g) {
  return (g.chainBreak ??= { state: "chained", at: 0, actor: null, nextAt: 0 });
}
function notify(g, text) {
  g.message = text;
  g.messageUntil = g.time + B.messageSeconds;
}
export function stepChainBreak(g, spawn) {
  const w = g.world,
    marked = w?.markedData;
  if (!marked || marked.hunters === false || !w.geometry || w.areaId !== D.areaId || !chainBreakOn()) return;
  const s = chainBreakState(g);
  if (g.player.hp <= 0 || g.finished) {
    if (s.state !== "done") Object.assign(s, { state: "chained", actor: null });
    return;
  }
  if (s.state === "done") return;
  const at = w.geometry.ground(D.at);
  if (s.state === "chained") {
    if (g.time < s.nextAt || gap(g.player.pos, at) > B.triggerMetres || safehouseTouches(g, g.player.pos, g.player.radius)) return;
    Object.assign(s, { state: "snapping", at: g.time });
    notify(g, B.text.snap);
    g.events.push({ type: "chained-pitborn-snap", position: { ...at } });
    return;
  }
  if (s.state === "snapping") {
    if (g.time < s.at + B.snapSeconds) return;
    // One hunter at a time (marked.maxHunters): wait while another hunter lives.
    if (g.enemies.some((e) => e.hp > 0 && e.markedHunter)) {
      s.at = g.time - B.snapSeconds + B.retrySeconds;
      return;
    }
    const actor = spawn(at, marked);
    g.enemies.push(actor);
    s.state = "loose";
    s.actor = actor;
    if (g.markedHunt) {
      g.markedHunt.hadHunter = true;
      g.markedHunt.nextSpawnAt = Math.max(g.markedHunt.nextSpawnAt, g.time + marked.spawnCooldown);
    }
    g.events.push({ type: "marked-hunter-arrived", actor, position: { ...at } });
    notify(g, B.text.loose);
    return;
  }
  // The Pitborn leaves the enemy list when it dies (done) or when travel clears hunters (back in its chains).
  if (s.state === "loose" && !g.enemies.includes(s.actor)) s.state = s.actor.hp <= 0 ? "done" : "chained";
}
