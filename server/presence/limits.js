// The one-off push a hit adds to a player, read from Combat's data so presence never guesses it. combat.js applies
// walkSpeed * knockback / 60 metres in a single step to a hurt player; knockback comes from the attack rows (knife moves, melee
// variants, and any `knockback` field in the area content: boss and creature attacks). The largest of them bounds the push.
import { KNIFE_MOVES, KNIFE_RULES } from "../../Web/src/donor/knife.js";
import { MELEE_VARIANTS } from "../../Web/src/engine/melee-equipment-data.js";

/** Every numeric `knockback` value found anywhere inside `tree`. */
export function knockbacks(tree, found = []) {
  if (tree === null || typeof tree !== "object") return found;
  for (const [key, value] of Object.entries(tree)) {
    if (key === "knockback" && typeof value === "number") found.push(value);
    else knockbacks(value, found);
  }
  return found;
}

/** The largest single knockback step, in whole centimetres rounded up. `content` is the parsed Web/public/world/area-content.json. */
export function maxKnockbackCm(content) {
  const all = [...knockbacks(KNIFE_MOVES), ...knockbacks(MELEE_VARIANTS), ...knockbacks(content)];
  if (all.length === 0 || !all.every((k) => Number.isFinite(k) && k >= 0)) throw new Error("no usable knockback values found");
  return Math.ceil((KNIFE_RULES.walkSpeed * Math.max(...all) * 100) / 60);
}

/** What checkMove needs, from World's data (maxSpeedCmPerS, checked by loadAreaRows) and Combat's (impulseCm). */
export function presenceLimits(rules, content) {
  return { maxSpeedCmPerS: rules.maxSpeedCmPerS, impulseCm: maxKnockbackCm(content) };
}
