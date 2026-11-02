// combatText.json: the English the combat, gear and save layers show (boss exit gate prompts, HUD messages, gear tile text, save-layer
// rejection messages). `{name}` style placeholders are filled by fillText. The validator lives here so the loader (engine/game-data.js)
// stays small.
import { closed } from "./content-schema.js";
import { fail } from "./game-data-checks.js";

const text = (field, v, placeholders = []) => {
  if (typeof v !== "string" || !v.trim()) fail("combatText", `${field} must be non-empty text`);
  const used = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  if (used.length !== placeholders.length || placeholders.some((p) => !used.includes(p)))
    fail("combatText", `${field} must use exactly the placeholders ${placeholders.map((p) => `{${p}}`).join(" ") || "(none)"}`);
};

export function validateCombatText(d) {
  closed(d, ["schema_version", "exitGate", "hud", "gear", "markedHunter", "bossFlame", "rewardNames", "layerMessages"]);
  // Each key with the {placeholders} its text must use.
  const hud = {
    enterCombat: [], hollowScavengers: [], pistolEquipped: [], knifeEquipped: [], emptyReload: [], outOfAmmo: [], parry: [],
    guardBroken: [], hollowCleared: [], knifeCleared: [], bossDefeated: ["name"], suppliesAwait: [], waveCleared: ["hp"],
    goblinEncounter: [], warlord: [], wave: ["wave", "final"], blade: ["pct"], armour: ["hp"], tonic: ["hp"], hollowEncounter: [],
  };
  closed(d.hud, Object.keys(hud));
  for (const [k, placeholders] of Object.entries(hud)) text(`hud.${k}`, d.hud[k], placeholders);
  const gear = {
    emberProjector: [], charges: ["count"], recallDeploy: [], empty: ["name"], equippedSuffix: [], tapToEquip: [], weaponSelection: [],
    collected: ["name"], collectedEquipInGear: ["name"], equipped: ["name"], startPistolLabel: [], ammoEmpty: [], ammoMelee: [],
    ammoDeployed: [], ammoCount: ["magazine", "capacity", "reserve"], fuelSuffix: [], pageOf: ["page", "total"],
    tileLabel: ["name", "ammo"], defaultRifleName: [],
  };
  closed(d.gear, [...Object.keys(gear), "iconCaptions"]);
  for (const [k, placeholders] of Object.entries(gear)) text(`gear.${k}`, d.gear[k], placeholders);
  if (!d.gear.iconCaptions || typeof d.gear.iconCaptions !== "object") fail("combatText", "gear.iconCaptions must be an object");
  for (const [id, caption] of Object.entries(d.gear.iconCaptions)) text(`gear.iconCaptions.${id}`, caption);
  closed(d.markedHunter, ["warning", "arrived", "label"]);
  text("markedHunter.label", d.markedHunter.label);
  text("markedHunter.warning", d.markedHunter.warning);
  text("markedHunter.arrived", d.markedHunter.arrived);
  closed(d.bossFlame, ["defaultBossName", "warning"]);
  text("bossFlame.defaultBossName", d.bossFlame.defaultBossName);
  text("bossFlame.warning", d.bossFlame.warning, ["name"]);
  closed(d.rewardNames, ["cleaver", "reaper"]);
  text("rewardNames.cleaver", d.rewardNames.cleaver);
  text("rewardNames.reaper", d.rewardNames.reaper);
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
