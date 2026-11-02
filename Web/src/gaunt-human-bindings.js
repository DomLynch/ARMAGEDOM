import { GAME_DATA } from "./engine/game-data.js";
// Body presentation only; retain each resident's role, supplies and saved identity.
// Which placement key gets the gaunt body in each area and cycle lives in Web/src/data/creatures.json `gauntHumanCycles`.
export const GAUNT_HUMAN_CYCLES = GAME_DATA.creatures.gauntHumanCycles;

export function gauntHumanRecipe(cycle, areaId, entity) {
  const key = GAUNT_HUMAN_CYCLES[cycle]?.[areaId];
  return typeof key === "string" &&
    entity?.kind >= 0 &&
    entity.rig === "hollow-scavenger" &&
    key === entity.placementKey
    ? "human-gaunt-skulker"
    : null;
}
