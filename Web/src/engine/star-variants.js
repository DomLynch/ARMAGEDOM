import { GAME_DATA } from "./game-data.js";
// Star variants (data/starVariants.json): a resident hostile or boss may spawn as 1-star or 2-star. The roll comes only from the area, the
// animal cycle and the placement key, so every client rolls the same stars for the same spawn. Stars scale HP, damage and size through the
// existing actor fields (maxHP, mobSize, combatScale, radius); the tell is drawn by engine/star-variants-view.js. Rules are the last argument
// so a test can pass a copy of the frozen data.
export const STAR_VARIANTS = GAME_DATA.starVariants;
// 0 for an ordinary spawn, else the star count whose cumulative chance the placement's roll falls under.
export function rollStars(areaId, cycle, key, isBoss, rules = STAR_VARIANTS) {
  if (!rules.enabled || rules.excludedAreas.includes(areaId)) return 0;
  const { seed, prime, modulus, shift } = rules.roll;
  let h = seed,
    edge = 0;
  for (const ch of `${areaId}|${cycle}|${key}`) h = Math.imul(h ^ ch.charCodeAt(0), prime) >>> 0;
  // Final mixing so keys that differ only in their last characters still spread across the whole range.
  h = Math.imul(h ^ (h >>> shift), prime) >>> 0;
  h = (h ^ (h >>> shift)) >>> 0;
  for (const row of rules.stars) {
    edge += isBoss ? row.bossChance : row.chance;
    if (h / modulus < edge) return row.stars;
  }
  return 0;
}
const rowFor = (areaId, cycle, key, isBoss, rules) => {
  const stars = rollStars(areaId, cycle, key, isBoss, rules);
  return rules.stars.find((r) => r.stars === stars);
};
// The health a placement spawns with once its stars are rolled; worldSpawnRows publishes this so the plan matches the game.
export const starHealth = (areaId, cycle, key, isBoss, health, rules = STAR_VARIANTS) =>
  Math.round(health * (rowFor(areaId, cycle, key, isBoss, rules)?.hp ?? 1));
// Rolls and applies the stars to a built resident. Drones and bodies without a placement key are never starred.
export function applyStarVariant(actor, areaId, cycle, rules = STAR_VARIANTS) {
  if (actor.droneState || actor.star || !actor.placementKey) return actor;
  const row = rowFor(areaId, cycle, actor.placementKey, !!actor.bossProfile, rules);
  if (!row) return actor;
  actor.star = row;
  actor.maxHP = actor.hp = starHealth(areaId, cycle, actor.placementKey, !!actor.bossProfile, actor.maxHP, rules);
  actor.mobSize = (actor.mobSize ?? 1) * row.scale;
  for (const field of ["combatScale", "contactScale", "radius"])
    if (Number.isFinite(actor[field])) actor[field] *= row.scale;
  return actor;
}
// What a starred attacker's hit is worth against the base amount.
export const starDamage = (attacker) => attacker?.star?.damage ?? 1;
// A starred enemy pays at its row's drop tier when that ranks above its own (tier order is the killDrops tier order).
export function starDropTier(actor, tier, order) {
  const paid = actor.star?.dropTier;
  return paid && order.indexOf(paid) > order.indexOf(tier) ? paid : tier;
}
