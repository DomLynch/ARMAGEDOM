// Existing Art7747543 definitions; provenance gaps retained, no new asset or mechanics. The rows live in
// Web/src/data/creatureDefinitions.json (read through game-data.js); engine/creature-catalogue.js validates them in depth.
import { GAME_DATA } from "./game-data.js";

export const creatureDefinitions = GAME_DATA.creatureDefinitions.definitions;
export const recipeFoundations = GAME_DATA.creatureDefinitions.recipeFoundations;
export const nativeRoleDefinitions = GAME_DATA.creatureDefinitions.nativeRoles;
