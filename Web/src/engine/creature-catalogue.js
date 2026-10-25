import { creatureDefinitions, recipeFoundations, nativeRoleDefinitions } from "./creature-definitions.js";
import { resolveCreatureBehaviour } from "../creature-behaviour-presets.js";
import { resolveResidentIntent } from "../creature-behaviour-intents.js";
import { GAME_DATA } from "./game-data.js";
// Capabilities provided by existing resident movement/native completion/neighbour seams.
export const ENGINE_CREATURE_CAPABILITIES = Object.freeze([
  "home",
  "lineOfSight",
  "completedAttack",
  "collisionMove",
  "wakeTime",
  "nativeLocomotion",
  "eligibleCompanions",
]);
// The per-foundation controller/weapon/rig/actions and the native contact reach live in Web/src/data/creatures.json `catalogue`.
const { support, reach } = GAME_DATA.creatures.catalogue;
const freeze = (value) => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
function dataOnly(value) {
  if (
    ["function", "undefined", "symbol", "bigint"].includes(typeof value) ||
    (typeof value === "number" && !Number.isFinite(value))
  )
    throw Error("Creature catalogue requires data only");
  if (value && typeof value === "object")
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw Error("Unsafe catalogue field");
      dataOnly(child);
    }
}
function closed(row, keys) {
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row) ||
    Object.keys(row).some((k) => !keys.includes(k)) ||
    keys.some((k) => !Object.hasOwn(row, k))
  )
    throw Error("Unknown or missing catalogue field");
}
export function createCreatureCatalogue({
  foundations = creatureDefinitions,
  recipes = recipeFoundations,
  roles = nativeRoleDefinitions,
  variants = [],
  capabilities = ENGINE_CREATURE_CAPABILITIES,
} = {}) {
  if (
    !Array.isArray(capabilities) ||
    !Object.isFrozen(capabilities) ||
    capabilities.some((c) => !ENGINE_CREATURE_CAPABILITIES.includes(c)) ||
    new Set(capabilities).size !== capabilities.length
  )
    throw Error("Immutable engine capabilities required");
  dataOnly({ foundations, recipes, roles, variants });
  const rows = structuredClone(foundations),
    map = new Map();
  for (const row of rows) {
    closed(row, [
      "id",
      "rig",
      "contactRig",
      "assetRef",
      "clips",
      "scale",
      "stats",
      "behaviour",
      "clipSourceRefs",
      "preparationRefs",
      "equipmentRef",
      "provenanceRef",
      "runtimeIdentity",
    ]);
    const pair = Object.hasOwn(support, row.runtimeIdentity) ? support[row.runtimeIdentity] : null;
    if (!pair ||row.id !== row.runtimeIdentity || map.has(row.id)) throw Error("Unknown or duplicate foundation");
    closed(row.behaviour, ["controllerRef", "parameterPreset", "intentPolicyRef"]);
    closed(row.stats, ["health", "radius", "moveSpeed", "recoveryDelay", "weapon"]);
    closed(row.scale, ["model", "character", "visual", "mobSizeMode", "bodyScale", "appliedBy"]);
    if (
      row.rig !== pair.rig ||
      row.behaviour.controllerRef !== pair.controller ||
      row.stats.weapon !== pair.weapon ||
      pair.actions.some((action) => typeof row.clips[action] !== "string")
    )
      throw Error("Controller/foundation/action mismatch");
    if (row.runtimeIdentity === "low-hover-drone") {
      if (
        Object.keys(row.clips).length ||
        row.behaviour.parameterPreset !== null ||
        row.behaviour.intentPolicyRef !== null ||
        row.scale.model !== 2 ||
        row.scale.character !== 1 ||
        row.scale.visual !== 1 ||
        row.scale.appliedBy !== "procedural-library"
      )
        throw Error("Drone identity/scale mismatch");
    } else {
      if (
        row.behaviour.intentPolicyRef !== "existing-resident-intent-policy" ||
        !["home", "lineOfSight"].every((c) => capabilities.includes(c))
      )
        throw Error("Resident capabilities missing");
      resolveCreatureBehaviour(row.behaviour.parameterPreset, {
        ...row.stats,
        recoveryDelay: row.stats.recoveryDelay,
        weapon: row.stats.weapon,
        supportedActions: Object.keys(row.clips),
      });
    }
    const accepted = creatureDefinitions.find((d) => d.id === row.id);
    if (
      JSON.stringify(row.stats) !== JSON.stringify(accepted.stats) ||
      JSON.stringify(row.scale) !== JSON.stringify(accepted.scale) ||
      [
        "rig",
        "contactRig",
        "assetRef",
        "clips",
        "clipSourceRefs",
        "preparationRefs",
        "equipmentRef",
        "provenanceRef",
        "runtimeIdentity",
      ].some((key) => JSON.stringify(row[key]) !== JSON.stringify(accepted[key]))
    )
      throw Error("Unreviewed foundation stats/scale/asset/clip");
    map.set(row.id, freeze(row));
  }
  if (map.size !== 7) throw Error("Seven reviewed foundations required");
  const recipeMap = structuredClone(recipes);
  for (const [recipe, foundation] of Object.entries(recipeMap))
    if (!Object.hasOwn(recipeFoundations, recipe) || recipeFoundations[recipe] !== foundation || !map.has(foundation))
      throw Error("Unknown recipe/foundation reference");
  for (const [recipe, foundation] of Object.entries(recipeMap))
    if (foundation !== "low-hover-drone") resolveResidentIntent(recipe, { behaviourCapabilities: capabilities });
  const roleRows = structuredClone(roles);
  if (JSON.stringify(roleRows) !== JSON.stringify(nativeRoleDefinitions))
    throw Error("Unreviewed exact role activation");
  for (const row of roleRows) {
    const d = map.get(row.foundation);
    if (recipeMap[row.recipe] !== row.foundation) throw Error("Role recipe/foundation mismatch");
    resolveResidentIntent(row.recipe, { behaviourCapabilities: capabilities });
    resolveCreatureBehaviour(row.preset, {
      moveSpeed: d.stats.moveSpeed,
      recoveryDelay: d.stats.recoveryDelay,
      weapon: d.stats.weapon,
      supportedActions: Object.keys(d.clips),
    });
  }
  const aliases = new Map();
  for (const row of variants) {
    closed(row, ["id", "foundationRef", "recipeRef"]);
    if (
      typeof row.id !== "string" ||
      !/^fixture-[a-z0-9-]+$/.test(row.id) ||
      aliases.has(row.id) ||
      !map.has(row.foundationRef) ||
      recipeMap[row.recipeRef] !== row.foundationRef
    )
      throw Error("Unknown variant reference");
    aliases.set(row.id, freeze(structuredClone(row)));
  }
  return Object.freeze({
    get: (id) => {
      const key = aliases.get(id)?.foundationRef ?? id;
      if (!map.has(key)) throw Error("Unknown creature foundation");
      return map.get(key);
    },
    forRecipe: (recipe) => {
      if (!Object.hasOwn(recipeMap, recipe)) throw Error("Unknown creature recipe");
      return map.get(recipeMap[recipe]);
    },
    roles: freeze(roleRows),
    variant: (id) => aliases.get(id),
  });
}
export const creatureCatalogue = createCreatureCatalogue();
export function animalFoundationParameters(id, combatScale, catalogue = creatureCatalogue) {
  const row = catalogue.get(id);
  id = row.runtimeIdentity;
  if (!Object.hasOwn(reach, id)) throw Error("Expected native animal foundation");
  return {
    rig: row.runtimeIdentity,
    contactRig: row.contactRig,
    weapon: row.stats.weapon,
    mobSize: 1,
    bodyScale: row.scale.bodyScale,
    radius: row.stats.radius,
    hp: row.stats.health,
    maxHP: row.stats.health,
    moveSpeed: row.stats.moveSpeed,
    recoveryDelay: row.stats.recoveryDelay,
    combatScale,
    contactGoalReach: reach[id],
  };
}
