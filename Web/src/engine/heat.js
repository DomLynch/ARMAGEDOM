import { GAME_DATA } from "./game-data.js";
import { applyStarRow, starsEnabled, STAR_VARIANTS } from "./star-variants.js";
import { seeded } from "./heat-tally-strokes.js";

// HEAT (data/heat.json): +1 for every kill, a mark lost after each decay.secondsPerMark without one, back to zero on the player's death.
// It scales the existing marked hunt (marked-hunters.js) by tier: shorter waits, one more hunter at once, and star hunters at the top tier.
// State is `g.heat` on the live game only: never saved, never sent. Kills are read from the game's own kill count, so combat.js is untouched.
const HEAT = GAME_DATA.heat;

// Off switch: the URL parameter named in the data (offSwitch.param) set to offSwitch.value turns heat off. `search` is for tests.
export function heatEnabled(rules = HEAT, search = undefined) {
  const query = search ?? globalThis.location?.search ?? "";
  return rules.enabled && new URLSearchParams(query).get(rules.offSwitch.param) !== rules.offSwitch.value;
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
    h.count += kills - h.seen;
    h.seen = kills;
    h.lastKillAt = g.time;
  }
  const { secondsPerMark } = rules.decay;
  while (h.count > 0 && g.time - h.lastKillAt >= secondsPerMark) {
    h.count -= 1;
    h.lastKillAt += secondsPerMark;
  }
  if (h.count === 0) h.lastKillAt = g.time;
}

// The player died: heat is gone.
export function resetHeat(g) {
  if (!g.heat) return;
  g.heat.count = 0;
  g.heat.seen = g.kills ?? 0;
  g.heat.lastKillAt = g.time;
}

// The highest tier row whose minHeat the current heat has reached, or null below the first.
export function heatTier(g, rules = HEAT) {
  const n = g.heat?.count ?? 0;
  return [...rules.pressure.tiers].reverse().find((t) => t.minHeat <= n) ?? null;
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
  if (!fadeSeconds || phase <= fadeStart) return { count: h.count, lastAlpha: 1 };
  return { count: h.count, lastAlpha: 1 - Math.min(1, (phase - fadeStart) / fadeSeconds) * (1 - minAlpha) };
}
