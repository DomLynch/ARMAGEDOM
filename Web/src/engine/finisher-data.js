import { GAME_DATA } from "./game-data.js";
export { validateFinisherData } from "./finisher-data-validator.js";

// The table is Web/src/data/finisherData.json, validated by finisher-data-validator.js when game-data.js loads it.
export const FINISHER_DATA = GAME_DATA.finisher;
export const FLAME_DEATH_DATA = FINISHER_DATA.flameDeath;
export const finisherDefinition = (id) => FINISHER_DATA.recipes.find((r) => r.id === id) ?? null;

export const remainingFinisherPartSeconds = (age, data = FINISHER_DATA) =>
  Math.max(0, data.limits.partLifetime - Math.max(0, age));

export const flameDeathSeconds = (nativeSeconds = FLAME_DEATH_DATA.nativeSeconds, data = FLAME_DEATH_DATA) =>
  Math.min(
    data.maxSeconds,
    Math.max(0, Number.isFinite(nativeSeconds) ? nativeSeconds : data.nativeSeconds) +
      data.collapseTailSeconds +
      data.holdSeconds +
      data.fadeSeconds,
  );

export const finisherPresentationId = (id) => finisherDefinition(id)?.presentationRecipeId ?? id;
export const isFlameRecipe = (id) => finisherDefinition(id)?.damageType === "flame";
export function goreProfile(id) {
  const def = finisherDefinition(id),
    target = def?.goreRecipeId ?? id,
    profile = FINISHER_DATA.gore.profiles.find((p) => p.recipeId === target);
  return profile ? (target === id ? profile : { ...profile, recipeId: id }) : null;
}
export function withFinisherAliases(support) {
  const rows = [...support];
  for (const def of FINISHER_DATA.recipes)
    if (def.presentationRecipeId) {
      const base = rows.find((row) => row.id === def.presentationRecipeId);
      if (base) {
        const alias = { ...base, id: def.id },
          index = rows.findIndex((row) => row.id === def.id);
        if (index >= 0) rows[index] = alias;
        else rows.push(alias);
      }
    }
  return rows;
}
