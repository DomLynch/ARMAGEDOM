import { creatureCatalogue } from "./engine/creature-catalogue.js";
import { GAME_DATA } from "./engine/game-data.js";
// Appearance/body catalogue only. Human and named animal role mechanics remain unchanged.
// The recipe each roamer wears in cycle A and B lives in Web/src/data/creatures.json `animalCycles`.
export const ANIMAL_CYCLES = GAME_DATA.creatures.animalCycles;
export const nextAnimalCycle = (cycle) => (cycle === "B" ? "A" : "B");
export function animalPlacement(cycle, key) {
  const recipe = ANIMAL_CYCLES[cycle]?.[key];
  if (!recipe) return null;
  const offset =
    key === "east-roamer-9"
      ? { x: -0.014, z: -0.278 }
      : cycle === "A" && key === "east-roamer-5"
        ? { x: 0, z: -0.046 }
        : { x: 0, z: 0 };
  return { recipe, rig: creatureCatalogue.forRecipe(recipe).runtimeIdentity, offset };
}
