import { GAME_DATA } from "./game-data.js";
import { applyStarRow, starsEnabled, STAR_VARIANTS } from "./star-variants.js";
import { seeded } from "./heat-tally-strokes.js";
import { webText } from "./web-text.js";

// HEAT (data/heat.json): +1 for every kill, a mark lost after each decay.secondsPerMark without one, back to zero on the player's death.
// It scales the existing marked hunt (marked-hunters.js) by tier: shorter waits, one more hunter at once, and star hunters at the top tier.
// State is `g.heat` on the live game only: never saved, never sent. Kills are read from the game's own kill count, so combat.js is untouched.
const HEAT = GAME_DATA.heat;

// Off switch: the URL parameter named in the data (offSwitch.param) set to offSwitch.value turns heat off. `search` is for tests.
// The page's own address never changes, so its answer is worked out once per rules row.
const pageOff = new WeakMap();
export function heatEnabled(rules = HEAT, search = undefined) {
  if (!rules.enabled) return false;
  const parse = (query) => new URLSearchParams(query).get(rules.offSwitch.param) === rules.offSwitch.value;
  if (search !== undefined) return !parse(search);
  if (!pageOff.has(rules)) pageOff.set(rules, parse(globalThis.location?.search ?? ""));
  return !pageOff.get(rules);
}

// Each simulation step (from stepMarkedHunters): take new kills, drop one mark per decay period.
export function stepHeat(g, rules = HEAT, search = undefined) {
  if (!heatEnabled(rules, search)) {
    g.heat = null;
    return;
  }
  const kills = g.kills ?? 0,
    h = (g.heat ??= { count: 0, lastKillAt: g.time, seen: kills, rolls: 0 }); // kills before this session never count
  if (kills < h.seen) h.seen = kills; // a fresh run restarts the kill count
  if (kills > h.seen) {
    const gained = kills - h.seen;
    h.seen = kills;
    addHeat(g, gained, rules, search);
  }
  const { secondsPerMark } = rules.decay;
  while (h.count > 0 && g.time - h.lastKillAt >= secondsPerMark) {
    h.count -= 1;
    h.lastKillAt += secondsPerMark;
  }
  if (h.count === 0) h.lastKillAt = g.time;
}

// Heat goes up by `amount` (a kill, or a valuable from the valuables rows), never past maxHeat, and restarts the cooldown. Reaching a new
// tier says so on the HUD line (webText heat.tierUp).
export function addHeat(g, amount, rules = HEAT, search = undefined) {
  if (!g.heat || !(amount > 0) || !heatEnabled(rules, search)) return;
  const before = heatTier(g, rules);
  g.heat.count = Math.min(rules.maxHeat, g.heat.count + amount);
  g.heat.lastKillAt = g.time;
  const after = heatTier(g, rules);
  if (after && after !== before) {
    g.message = webText("heat.tierUp");
    g.messageUntil = g.time + rules.tierMessageSeconds;
  }
}

// Cash or a crate claimed (world-pickups-core.js claimCash, the one place every cash pickup passes): cash rows give +1 per perHeat cash
// collected from matching sources (the remainder carries over), claim rows give a flat amount for one source.
export function heatFromClaim(g, source, amount, rules = HEAT) {
  if (!g.heat || !(amount > 0)) return;
  for (const row of rules.valuables.cash)
    if (source.startsWith(row.sourcePrefix)) {
      const bank = (g.heat.cashBank ?? 0) + amount,
        gained = Math.floor(bank / row.perHeat);
      g.heat.cashBank = bank - gained * row.perHeat;
      addHeat(g, gained, rules);
    }
  for (const row of rules.valuables.claims) if (row.source === source) addHeat(g, row.heat, rules);
}

// Game events that are valuables (a boss kill), each read once however often the step is read again (the loop calls this after each step).
export function heatFromEvents(g, rules = HEAT) {
  if (!g.heat) return;
  const seen = (g.heatSeen ??= new WeakSet());
  for (const e of g.events ?? []) {
    if (seen.has(e)) continue;
    seen.add(e);
    for (const row of rules.valuables.events) if (row.type === e.type) addHeat(g, row.heat, rules);
  }
}

// The player died: heat is gone.
export function resetHeat(g) {
  if (!g.heat) return;
  g.heat.cashBank = 0;
  g.heat.count = 0;
  g.heat.seen = g.kills ?? 0;
  g.heat.lastKillAt = g.time;
}

// The highest tier row whose minHeat the current heat has reached, or null below the first. The rows are validated ascending, so the walk
// runs from the top and nothing is copied or sorted.
export function heatTier(g, rules = HEAT) {
  const n = Math.min(rules.maxHeat, g.heat?.count ?? 0),
    tiers = rules.pressure.tiers;
  for (let i = tiers.length - 1; i >= 0; i--) if (tiers[i].minHeat <= n) return tiers[i];
  return null;
}

// A hunt wait scaled by the tier, never below pressure.minSeconds (and never above the base wait).
export function heatSeconds(g, seconds, rules = HEAT) {
  const tier = heatTier(g, rules);
  return tier ? Math.min(seconds, Math.max(rules.pressure.minSeconds, seconds * tier.timeScale)) : seconds;
}

// Hunters the normal hunt may have at once: its own maxHunters plus the tier's extra, kept inside the post-boss raid cap
// (postBossRaid.maxSimultaneous counts every marked hunter, raiders included).
export function heatHunterLimit(g, base, rules = HEAT, raid = GAME_DATA.postBossRaid) {
  const tier = heatTier(g, rules);
  if (!tier || !tier.extraHunters) return base;
  const raiders = g.enemies.filter((e) => e.raidHunter && e.hp > 0).length;
  return Math.max(base, Math.min(base + tier.extraHunters, raid.maxSimultaneous - raiders));
}

// At a tier with star chances a new hunter may arrive as a star variant (starVariants.json rows: size, damage and the tell; never health).
export function heatStarHunter(g, actor, rules = HEAT, stars = STAR_VARIANTS) {
  const tier = heatTier(g, rules);
  if (!tier || !tier.stars.length || !starsEnabled(stars) || stars.excludedAreas.includes(g.world.areaId)) return actor;
  g.heat.rolls += 1;
  const roll = seeded(rules.seed + g.heat.rolls * rules.rng.stride, rules.rng)();
  let edge = 0;
  for (const s of tier.stars) {
    edge += s.chance;
    const row = stars.stars.find((r) => r.stars === s.stars);
    if (row && roll < edge) return applyStarRow(actor, row);
  }
  return actor;
}

// What the tally shows now: the count and the alpha of the newest mark, which dims through the last fadeSeconds before it drops.
export function heatShown(g, rules = HEAT) {
  const h = g.heat;
  if (!h || !h.count) return null;
  const { secondsPerMark, fadeSeconds, minAlpha } = rules.decay,
    fadeStart = secondsPerMark - fadeSeconds,
    phase = g.time - h.lastKillAt;
  if (!fadeSeconds || phase <= fadeStart) return { count: Math.min(rules.maxHeat, h.count), lastAlpha: 1 };
  return { count: Math.min(rules.maxHeat, h.count), lastAlpha: 1 - Math.min(1, (phase - fadeStart) / fadeSeconds) * (1 - minAlpha) };
}
