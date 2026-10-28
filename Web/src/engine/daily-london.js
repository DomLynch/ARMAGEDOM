import { GAME_DATA, fillText } from "./game-data.js";
import { currentDay, seededRandom } from "./spawn-variation.js";
// Daily London (data/dailyLondon.json): the same map, a different apocalypse each day. One modifier row is drawn from the UTC day with the
// spawn-variation generator, so everyone gets the same one; a row is a few effects on systems the game already has (area light, how far a
// resident notices the player, the marked hunters' waits and cap, the cash stash floor, the medkit heal). Nothing is saved, and nothing here
// touches a value the server checks: a stash still pays at most worldPickups cashStash.max, the amount arma_pickup_rules caps a claim at.
// The day and the URL search are the last arguments, so a test can name them; the game passes only the area.
export const DAILY = GAME_DATA.dailyLondon;
const NEUTRAL = DAILY.neutral,
  drawn = new Map(),
  merged = new Map(),
  hunts = new WeakMap();
// The modifier row for an area today, or null: off by ?<offSwitch.param>=<offSwitch.value>, outside a browser, or in an excluded area.
export function dailyRow(areaId, day, search) {
  const on = day !== undefined ? day : currentDay(),
    query = search !== undefined ? search : globalThis.location?.search,
    key = `${areaId}|${on}|${query}`;
  if (!drawn.has(key)) {
    const off = new URLSearchParams(query).get(DAILY.offSwitch.param) === DAILY.offSwitch.value,
      skip = !on || !DAILY.enabled || off || DAILY.excludedAreas.includes(areaId);
    drawn.set(key, skip ? null : DAILY.rows[Math.floor(seededRandom(DAILY.seedKey + on)() * DAILY.rows.length)]);
  }
  return drawn.get(key);
}
// Every effect for an area today: the row's over the neutral set. The same frozen object comes back for the same row.
export function dailyEffects(areaId, day, search) {
  const row = dailyRow(areaId, day, search);
  if (!row) return NEUTRAL;
  if (!merged.has(row.id)) merged.set(row.id, Object.freeze({ ...NEUTRAL, ...row.effects }));
  return merged.get(row.id);
}
// How far a resident notices the player today, as a multiple of its own range (1 when there is no modifier).
export const dailySight = (areaId) => dailyEffects(areaId).sight;
// An area's light preset with the day's light effect on it.
export const dailyLight = (preset, effects) =>
  effects === NEUTRAL
    ? preset
    : { fillIntensity: preset.fillIntensity * effects.light.fill, keyIntensity: preset.keyIntensity * effects.light.key };
// The cash stash rules with the pay floor raised, never past the stash maximum (which the server's claim rule matches).
export const dailyStash = (rules, effects) => ({ ...rules, min: Math.min(rules.max, Math.max(rules.min, effects.stashFloor)) });
// The marked-hunter settings with the waits scaled and the cap raised. The same copy comes back while the settings and the day stay.
export function dailyHunt(config, effects) {
  if (effects.hunt === NEUTRAL.hunt) return config;
  let hit = hunts.get(config);
  if (hit?.effects !== effects) {
    const { arrival, respawn, extra } = effects.hunt;
    hit = {
      effects,
      config: {
        ...config,
        arrivalDelay: config.arrivalDelay * arrival,
        respawnDelay: config.respawnDelay * respawn,
        maxHunters: config.maxHunters + extra,
      },
    };
    hunts.set(config, hit);
  }
  return hit.config;
}
export const dailyAnnounce = (row) => fillText(DAILY.text.announce, { name: row.name, line: row.line });
export const dailyBadge = (row) => fillText(DAILY.text.badge, { name: row.name.toUpperCase() });
