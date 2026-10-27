import { closed, freeze } from "./content-schema.js";
import { safehouseTouches } from "./safehouse.js";
import { markedEntry } from "./marked-hunters.js";
import { fillText } from "./game-data.js";
// CURSED RELIC. Every value lives in area-content.json `cursedRelic`. The relic is a rare pickup, one fixed hard-to-reach spot per
// listed area. While it is carried: player damage is multiplied and extra marked hunters arrive on a timer. A safehouse, death or
// leaving the area (hunters only) ends it. The state lives on the run object and is never saved, so a reload clears it exactly as a
// safehouse reset does.
const COLOR = /^#[0-9a-f]{6}$/i;
const VISUAL_KEYS = [
  "color",
  "emissive",
  "halo",
  "size",
  "hoverHeight",
  "bobAmount",
  "bobSeconds",
  "spinSeconds",
  "emissiveIntensity",
  "haloRadius",
  "haloOpacity",
];
const TEXT_KEYS = ["pickup", "hud", "reset", "lost"];
const positive = (n) => Number.isFinite(n) && n > 0;
export function validateCursedRelicData(input, registry) {
  if (input === undefined) return null;
  closed(input, [
    "version",
    "damageMultiplier",
    "hunterIntervalSeconds",
    "huntersPerInterval",
    "maxHunters",
    "pickupRadius",
    "retrySeconds",
    "messageSeconds",
    "placements",
    "visual",
    "text",
  ]);
  closed(input.visual, VISUAL_KEYS);
  closed(input.text, TEXT_KEYS);
  for (const k of ["color", "emissive", "halo"]) if (!COLOR.test(input.visual[k])) throw TypeError("Invalid relic colour");
  for (const k of VISUAL_KEYS.filter((k) => !COLOR.test(String(input.visual[k]))))
    if (!positive(input.visual[k])) throw TypeError("Invalid relic visual");
  for (const k of TEXT_KEYS) if (typeof input.text[k] !== "string" || !input.text[k].trim()) throw TypeError("Invalid relic text");
  for (const k of ["damageMultiplier", "hunterIntervalSeconds", "pickupRadius", "retrySeconds", "messageSeconds"])
    if (!positive(input[k])) throw TypeError("Invalid relic rule");
  for (const k of ["huntersPerInterval", "maxHunters"])
    if (!Number.isSafeInteger(input[k]) || input[k] < 1) throw TypeError("Invalid relic count");
  if (input.version !== 1 || input.damageMultiplier < 1) throw TypeError("Invalid relic rules");
  const ids = Object.keys(input.placements ?? {});
  closed(input.placements, ids);
  if (!ids.length) throw TypeError("Relic placements required");
  for (const id of ids) {
    const p = input.placements[id];
    closed(p, ["x", "y"]);
    if (!registry.has(id) || registry.get(id).visibility !== "public" || ![p.x, p.y].every((n) => Number.isFinite(n) && n > 0 && n < 1))
      throw TypeError("Invalid relic placement");
  }
  return freeze(structuredClone(input));
}
// A relic spot must stand on walkable ground clear of scenery (the world checks it against the area's real layout at load).
export function validateCursedRelicGeometry(data, areaId, geometry) {
  const p = data?.placements[areaId];
  if (p && !geometry.clear(geometry.ground(p), data.pickupRadius)) throw Error("Cursed relic is not on usable ground");
}
export function cursedState(g) {
  return (g.cursed ??= { active: false, taken: {}, nextAt: 0, warning: null, nextAttemptAt: 0, areaId: null });
}
export const relicHunters = (g) => g.enemies.filter((e) => e.relicHunter && e.hp > 0);
export function relicPosition(g) {
  const w = g.world,
    p = w.cursedRelicData?.placements[w.areaId];
  return p && w.geometry ? w.geometry.ground(p) : null;
}
// Visible pickup: still in the world, in this area, not yet taken this run.
export function relicAvailable(g) {
  const s = cursedState(g);
  return !s.active && !s.taken[g.world.areaId] && !!relicPosition(g);
}
// The one damage hook. combat.js calls it where the player's damage lands (ranged, flame, melee), so the existing hit code is the pipeline.
export function cursedDamage(g, amount) {
  return g.cursed?.active ? amount * g.world.cursedRelicData.damageMultiplier : amount;
}
export function cursedHudText(g) {
  const c = g.world?.cursedRelicData;
  return c && g.cursed?.active
    ? fillText(c.text.hud, { mult: c.damageMultiplier, hunters: relicHunters(g).length })
    : "";
}
function notify(g, text, seconds) {
  g.message = text;
  g.messageUntil = g.time + seconds;
}
export function clearCursed(g, reason) {
  const c = g.world?.cursedRelicData,
    s = g.cursed;
  if (!c || !s?.active) return;
  g.enemies = g.enemies.filter((e) => !e.relicHunter);
  if (g.corpses) g.corpses = g.corpses.filter((e) => !e.relicHunter);
  Object.assign(s, { active: false, warning: null, nextAt: 0, taken: { ...s.taken, [s.areaId]: true } });
  if (reason !== "death") notify(g, c.text.reset, c.messageSeconds);
  else notify(g, c.text.lost, c.messageSeconds);
}
export function stepCursedRelic(g, spawn) {
  const c = g.world.cursedRelicData;
  if (!c) return;
  const s = cursedState(g);
  if (g.player.hp <= 0 || g.finished) {
    clearCursed(g, "death");
    return;
  }
  if (s.active) {
    if (safehouseTouches(g, g.player.pos, g.player.radius)) {
      clearCursed(g, "safehouse");
      return;
    }
    if (s.huntArea !== g.world.areaId) {
      // Travel already removed the hunters (clearMarkedHunters); the timer carries on in the new area.
      s.huntArea = g.world.areaId;
      s.warning = null;
    }
    stepRelicHunters(g, c, s, spawn);
    return;
  }
  const at = relicAvailable(g) && relicPosition(g);
  if (at && !safehouseTouches(g, g.player.pos, g.player.radius) && Math.hypot(at.x - g.player.pos.x, at.z - g.player.pos.z) <= c.pickupRadius) {
    Object.assign(s, { active: true, areaId: g.world.areaId, huntArea: g.world.areaId, nextAt: g.time + c.hunterIntervalSeconds, warning: null });
    notify(g, c.text.pickup, c.messageSeconds);
    g.events.push({ type: "cursed-relic-taken", position: { ...at } });
  }
}
function stepRelicHunters(g, c, s, spawn) {
  const marked = g.world.markedData;
  if (!marked || g.time < s.nextAt || g.time < s.nextAttemptAt) return;
  if (relicHunters(g).length >= c.maxHunters) {
    s.warning = null;
    return;
  }
  if (!s.warning) {
    const p = markedEntry(g);
    s.nextAttemptAt = g.time + c.retrySeconds;
    if (!p) return;
    s.warning = { position: p, arrivesAt: g.time + marked.warningSeconds };
    g.events.push({ type: "marked-hunter-warning", position: { ...p }, seconds: marked.warningSeconds });
    return;
  }
  if (g.time < s.warning.arrivesAt) return;
  const p = s.warning.position;
  s.warning = null;
  s.nextAttemptAt = g.time + c.retrySeconds;
  if (!markedEntry(g, { position: p })) return;
  const room = c.maxHunters - relicHunters(g).length;
  for (let i = 0; i < Math.min(room, c.huntersPerInterval); i++) {
    const actor = spawn(p, marked);
    actor.relicHunter = true;
    g.enemies.push(actor);
    g.events.push({ type: "marked-hunter-arrived", actor, position: { ...p } });
  }
  s.nextAt = g.time + c.hunterIntervalSeconds;
}
