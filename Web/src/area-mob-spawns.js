import { ANIMAL_CYCLES } from "./animal-cycle.js";
import { GAME_DATA } from "./engine/game-data.js";
import { rigText } from "./rig-capabilities.js";
// Registered world metres (x right, z forward), accepted Three020 layouts. The rows live in data/spawns.json.
// Westminster: six scattered residents; production disables the optional opening trio.
// East/South: nine residents each. Only current-area actors update/render.
// Starts and full short patrol legs are clear at .55 (Hollow radius .4 + margin).
// Presentation selection uses placement keys, independent of fresh-run actor IDs.
const crookedResidents = new Set(GAME_DATA.spawns.crookedResidents);
export function hollowLocomotionFor(entity) {
  return entity.kind >= 0 && entity.rig === "hollow-scavenger" && crookedResidents.has(entity.placementKey)
    ? "crooked-hollow"
    : null;
}
export const AREA_MOB_SPAWNS = GAME_DATA.spawns.mob;

// These four keep their cycle-A look before any cycle assigns a recipe; the recipes themselves live only in ANIMAL_CYCLES.
const FIRST_ANIMAL_KEYS = new Set(["westminster-roamer-4", "south-roamer-3", "westminster-roamer-6", "east-roamer-4"]);
const firstAppearance = (key) => (FIRST_ANIMAL_KEYS.has(key) ? ANIMAL_CYCLES.A[key] : undefined);
export function animalAppearanceFor(entity) {
  const id = entity.kind >= 0 ? (entity.animalRecipe ?? firstAppearance(entity.placementKey)) : null;
  // The recipe id starts with the species of the rig it dresses (rat-, dog-, roach-); the wolf and salamander have no such recipes.
  const prefix = rigText(entity.rig, "appearanceRecipe");
  return id && prefix && id.startsWith(`${prefix}-`) ? id : null;
}

// A placed encounter may change health without changing the shared foundation or AI.
export function residentEncounterHealth(placement, fallback) {
  if (!Object.hasOwn(placement, "encounter")) return fallback;
  const row = placement.encounter;
  if (
    !row ||
    Object.getPrototypeOf(row) !== Object.prototype ||
    Reflect.ownKeys(row).length !== 1 ||
    !Object.hasOwn(row, "health") ||
    !Number.isSafeInteger(row.health) ||
    row.health < 1 ||
    row.health > GAME_DATA.spawns.maxResidentHealth ||
    (placement.foundationRef !== undefined && placement.foundationRef !== "hollow-scavenger")
  )
    throw Error("Invalid resident encounter health");
  return row.health;
}
// A placement's appearanceRef model may carry a data switch (ratKing.json): off by a URL parameter, the placement is the plain creature again.
export function appearanceRefOn(ref, search = globalThis.location?.search ?? "") {
  const row = GAME_DATA.ratKing;
  return ref !== row.appearanceRef || (row.enabled && new URLSearchParams(search).get(row.offParam) !== row.offValue);
}
