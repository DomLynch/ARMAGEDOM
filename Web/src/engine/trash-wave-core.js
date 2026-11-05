import { GAME_DATA } from "./game-data.js";
import { QUALITY } from "./quality-tier.js";

// Pure parts of the timed trash-mob waves (data/trashWave.json): the page switch, the quality tier row, the group size formula and the
// live count. Nothing here touches the game state or the scene, so kill-drops.js and the tests can use it without loading actors.
export const TRASH_WAVE = GAME_DATA.trashWave;

// The page's switch, worked out once per rules row (the address never changes in a page). `search` is for tests. Waves are off unless the
// data says wavesEnabledDefault or the address carries the start switch (?waves=1).
const pageOn = new WeakMap();
export function wavesEnabled(rules = TRASH_WAVE, search = undefined) {
  const read = (query) =>
    rules.enabled &&
    (rules.wavesEnabledDefault || new URLSearchParams(query).get(rules.startSwitch.param) === rules.startSwitch.value);
  if (search !== undefined) return read(search);
  if (!pageOn.has(rules)) pageOn.set(rules, read(globalThis.location?.search ?? ""));
  return pageOn.get(rules);
}

// The tier row name (full, mid or low) the sizes and the live cap are read with. `quality` is for tests.
export const waveTier = (quality = QUALITY) => quality.row().name;
export const liveCap = (tier, rules = TRASH_WAVE) => rules.tiers[tier].liveCap;

// How many mobs a group sends in wave `wave` (counted from 1): 0 unless the wave is one the group fires on, else
// min(max, round(unitAmount * (1 + unitGrowth * n)) + unitStep * floor(n / spacing)) with n = waves since begin.
export function groupAmount(group, tier, wave) {
  const n = wave - group.begin;
  if (n < 0 || n % group.spacing !== 0) return 0;
  const size = group.sizes[tier];
  return Math.min(
    size.max,
    Math.round(size.unitAmount * (1 + group.unitGrowth * n)) + group.unitStep * Math.floor(n / group.spacing),
  );
}

// A boss-wave marker (an event and a notice only, no extra unit yet): from `begin`, every `spacing` waves.
export function isBossWave(wave, rules = TRASH_WAVE) {
  const n = wave - rules.bossMarker.begin;
  return n >= 0 && n % rules.bossMarker.spacing === 0;
}

// Wave mobs alive in the list (all of them, or one wave's), counted without building a list: the step calls this every frame.
export function liveWaveMobs(enemies, waveId = undefined) {
  let n = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.waveMob === true && e.hp > 0 && (waveId === undefined || e.waveId === waveId)) n++;
  }
  return n;
}
