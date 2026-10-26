import { createProgressionModel } from "./progression-state.js";
import { GAME_DATA } from "./game-data.js";
import { AREA_MOB_SPAWNS } from "../area-mob-spawns.js";
import { DRONE_KEYS } from "../drone-mechanics.js";
export function progressionOptions(g) {
  const world = g.world,
    placements = Object.fromEntries(
      world.registry.ids.map((area) => [
        area,
        (world.residentPlacements?.[area] ?? AREA_MOB_SPAWNS[area] ?? []).map((row) => ({ key: row.key })),
      ]),
    );
  for (const [key, area] of Object.entries(DRONE_KEYS))
    if (placements[area] && !placements[area].some((row) => row.key === key)) placements[area].push({ key });
  return {
    data: world.progressionData,
    placements,
    baseMaxHP: g.progressionBaseCaps?.hp ?? g.player.maxHP,
    baseMaxStamina: g.progressionBaseCaps?.stamina ?? g.player.maxStamina,
  };
}
export function initializeProgression(g) {
  if (!g.world.progressionData) return;
  g.progressionBaseCaps = { hp: g.player.maxHP, stamina: g.player.maxStamina };
  g.progressionModel = createProgressionModel(progressionOptions(g));
  g.progression = g.progressionModel.freshState();
  g.pendingProgressionDeaths = [];
}
export function progressionDamage(g, weaponId) {
  return g.progressionModel ? g.progressionModel.bonuses(g.progression, weaponId).damageMultiplier : 1;
}
// Shared by combat and equipment comparisons; keep existing per-family scaling.
export function effectiveWeaponDamage(g, weaponId, baseDamage) {
  return baseDamage * (weaponId === "knife" ? g.player.damage / GAME_DATA.combatRules.player.damage : 1) * progressionDamage(g, weaponId);
}
export function stageProgressionDeath(g, e, weaponId, damageApplied) {
  if (
    !g.progressionModel ||
    !Number.isFinite(damageApplied) ||
    damageApplied <= 0 ||
    !g.progressionModel.hasPlacement(e.placementKey, g.world.areaId) ||
    g.pendingProgressionDeaths.some((row) => row.placementKey === e.placementKey) ||
    g.progression.awards.some((row) => row.placementKey === e.placementKey)
  )
    return;
  if (g.pendingProgressionDeaths.length >= g.progressionModel.placementCount)
    throw Error("Progression pending bound exceeded");
  g.pendingProgressionDeaths.push({ placementKey: e.placementKey, areaId: g.world.areaId, weaponId, damageApplied });
}
