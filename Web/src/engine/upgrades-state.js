// Permanent safehouse upgrades (data/safehouseUpgrades.json): the levels this phone knows and the math every hook shares. The levels come from the
// writer (engine/upgrades-core.js) or the localStorage copy of its last answer; this file only holds them and turns a level into an effect.
// The effects are CLIENT-side: spare-magazine room (the carry cap of the pistol and rifle reserve), maximum stamina and dodge recovery. Nothing here
// changes damage. Level 0 everywhere is the game as it was, so a fresh phone, a guest and an offline start all play unchanged.
//   reserveBonus(resource)     the rounds the LIVE levels add to that reserve's carry cap (pickups, shop buys, the locker's withdraw use this)
//   reserveBonusMax(resource)  the rounds the TOP levels would add: a saved run is valid up to this bound whatever the live level is, so a run that
//                              holds extra rounds never becomes unreadable if the levels are lost (rollback, a cleared cache, another device)
//   staminaBonus(), dodgeRecoveryCut()  the extra maximum stamina, and the share of a roll's recovery that is taken off (0 to 1)
import { GAME_DATA } from "./game-data.js";

const DATA = GAME_DATA.safehouseUpgrades;
const levels = new Map(); // upgrade id -> level (1 and up; a missing id is level 0)

export const UPGRADE_ROWS = DATA.upgrades;
export const upgradeRow = (id) => DATA.upgrades.find((row) => row.id === id) ?? null;
const rowOf = (kind) => DATA.upgrades.find((row) => row.effect.kind === kind) ?? null;
export const upgradeLevel = (id) => levels.get(id) ?? 0;
export const upgradeLevels = () => Object.fromEntries(levels);

/** Replaces every level from a list of { id, level } (or a { id: level } object). Unknown ids and levels outside 0..maxLevel are dropped. */
export function setUpgradeLevels(list) {
  const entries = Array.isArray(list) ? list.map((row) => [row?.id, row?.level]) : Object.entries(list ?? {});
  levels.clear();
  for (const [id, level] of entries) {
    const row = upgradeRow(id);
    if (row && Number.isSafeInteger(level) && level > 0) levels.set(id, Math.min(level, row.maxLevel));
  }
}

/** What `level` of a row is worth, in the row's own unit (magazines, stamina points, or a share of the recovery). */
export const effectAt = (row, level) => row.effect.perLevel * level;
const worth = (kind, levelOf = upgradeLevel) => {
  const row = rowOf(kind);
  return row ? effectAt(row, levelOf(row.id)) : 0;
};
const roundsOf = (resource) => {
  const rounds = rowOf("reserveMagazines")?.effect.roundsPerMagazine;
  return rounds && Object.hasOwn(rounds, resource) ? rounds[resource] : 0;
};

export const reserveBonus = (resource, levelOf = upgradeLevel) =>
  worth("reserveMagazines", levelOf) * roundsOf(resource);
export const reserveBonusMax = (resource) => {
  const row = rowOf("reserveMagazines");
  return row ? effectAt(row, row.maxLevel) * roundsOf(resource) : 0;
};
export const staminaBonus = (levelOf = upgradeLevel) => worth("maxStamina", levelOf);
export const dodgeRecoveryCut = (levelOf = upgradeLevel) => worth("dodgeRecovery", levelOf);

/**
 * The knife roll's length in ticks after the dodge-recovery upgrade: the invulnerable part (up to `safeEnd`) is untouched, the recovery after it
 * (the rest of `roll`) shrinks by the cut. Level 0 returns `roll` itself.
 */
export const rollTicks = (roll, safeEnd, cut = dodgeRecoveryCut()) => roll - Math.max(0, roll - safeEnd) * cut;
/** The legacy dodge's cooldown in seconds after the same upgrade. */
export const dodgeCooldown = (seconds, cut = dodgeRecoveryCut()) => seconds * (1 - cut);

const applied = new WeakMap(); // player -> the stamina bonus already inside its maxStamina
/**
 * Brings `player.maxStamina` to base + bonus. `was` is the bonus already inside the maximum (the default is what this function last wrote; pass 0
 * right after the maximum was reset to the base). A player who was full stays full; one who was not keeps what they had. Returns true if it changed.
 */
export function applyStaminaUpgrade(player, bonus = staminaBonus(), was = applied.get(player) ?? 0) {
  if (!player || !Number.isFinite(player.maxStamina)) return false;
  applied.set(player, bonus);
  if (bonus === was) return false;
  const full = player.stamina >= player.maxStamina;
  player.maxStamina += bonus - was;
  if (Number.isFinite(player.stamina))
    player.stamina = full ? player.maxStamina : Math.min(player.stamina, player.maxStamina);
  return true;
}
