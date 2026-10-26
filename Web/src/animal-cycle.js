import { creatureCatalogue } from "./engine/creature-catalogue.js";
import { GAME_DATA } from "./engine/game-data.js";
// Appearance/body catalogue only. Human and named animal role mechanics remain unchanged.
// The recipe each roamer wears in cycle A and B lives in Web/src/data/creatures.json `animalCycles`.
export const ANIMAL_CYCLES = GAME_DATA.creatures.animalCycles;
// The few roamers whose body sits off its placement point, per cycle, are appearance.json `animalOffsets` (metres).
const OFFSETS = GAME_DATA.appearance.animalOffsets;
export const nextAnimalCycle = (cycle) => (cycle === "B" ? "A" : "B");
export function animalPlacement(cycle, key) {
  const recipe = ANIMAL_CYCLES[cycle]?.[key];
  if (!recipe) return null;
  const offset = OFFSETS[cycle]?.[key] ?? { x: 0, z: 0 };
  return { recipe, rig: creatureCatalogue.forRecipe(recipe).runtimeIdentity, offset };
}
