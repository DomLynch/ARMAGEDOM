import { GAME_DATA } from "./game-data.js";
// The rules for the light column where a rare drop fell (data/lootBeams.json). A kill credit that pays loot queues one beam row in
// `g.loot.beams`, styled by the best rarity in the drop (engine/loot.js calls queueBeam). engine/loot-beams-view.js draws the rows. A rarity with
// no style row (common) queues nothing. At most `maxBeams` rows are kept: a new one pushes the oldest out, so the view never holds more.
export const LOOT_BEAMS = GAME_DATA.lootBeams;

// On by default; the URL parameter named in the data (offSwitch.param) set to offSwitch.value (`?nobeams=1`) turns every beam off.
export const lootBeamsOn = (rules = LOOT_BEAMS, search = globalThis.location?.search ?? "") =>
  rules.enabled && new URLSearchParams(search).get(rules.offSwitch.param) !== rules.offSwitch.value;

// The look for a rarity name, or null when that rarity shows no beam.
export const beamStyle = (rarity, rules = LOOT_BEAMS) =>
  Object.hasOwn(rules.styles, rarity) ? rules.styles[rarity] : null;

// The best rarity in a list, ranked by `order` (loot.json rarityOrder, lowest first). A name missing from `order` ranks below every listed one.
export function strongestRarity(rarities, order) {
  let best = null,
    bestRank = -1;
  for (const name of rarities) {
    const rank = order.indexOf(name);
    if (best === null || rank > bestRank) {
      best = name;
      bestRank = rank;
    }
  }
  return best;
}

// Queue a beam at `at` ({x, z}) for `rarity`. Returns the row, or null when beams are off or the rarity has no look.
export function queueBeam(g, at, rarity, rules = LOOT_BEAMS, search = undefined) {
  const style = beamStyle(rarity, rules);
  if (!style || !lootBeamsOn(rules, search)) return null;
  const state = (g.loot ??= { glints: [], dropped: false }),
    rows = (state.beams ??= []),
    row = { x: at.x, z: at.z, area: g.world?.areaId, rarity, from: g.time, until: g.time + style.seconds };
  rows.push(row);
  while (rows.length > rules.maxBeams) rows.shift();
  return row;
}
