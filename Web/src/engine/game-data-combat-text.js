// combatText.json: the English the combat and save layers show (boss exit gate prompts, save-layer rejection messages).
// `{name}` style placeholders are filled by fillText. The validator lives here so the loader (engine/game-data.js) stays small.
import { closed } from "./content-schema.js";
import { fail } from "./game-data-checks.js";

const text = (field, v, placeholders = []) => {
  if (typeof v !== "string" || !v.trim()) fail("combatText", `${field} must be non-empty text`);
  const used = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  if (used.length !== placeholders.length || placeholders.some((p) => !used.includes(p)))
    fail("combatText", `${field} must use exactly the placeholders ${placeholders.map((p) => `{${p}}`).join(" ") || "(none)"}`);
};

export function validateCombatText(d) {
  closed(d, ["schema_version", "exitGate", "layerMessages"]);
  closed(d.exitGate, ["needsKill", "needsVisit", "saveUnavailable"]);
  text("exitGate.needsKill", d.exitGate.needsKill, ["name"]);
  text("exitGate.needsVisit", d.exitGate.needsVisit, ["destination"]);
  text("exitGate.saveUnavailable", d.exitGate.saveUnavailable);
  closed(d.layerMessages, ["bossEquipment", "rifle", "uniqueReward"]);
  for (const [layer, row] of Object.entries(d.layerMessages)) {
    closed(row, ["envelope", "base", "snapshot"]);
    for (const k of ["envelope", "base", "snapshot"]) text(`layerMessages.${layer}.${k}`, row[k]);
  }
}

export const fillText = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key]);
