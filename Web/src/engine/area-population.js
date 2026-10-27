import { closed, freeze } from "./content-schema.js";
import { creatureCatalogue } from "./creature-catalogue.js";
import { AREA_MOB_SPAWNS } from "../area-mob-spawns.js";
import { AREA_DRONE_SPAWNS } from "../area-drone-spawns.js";
import { rigCapability, rigText } from "../rig-capabilities.js";
const fail = () => {
  throw Error("Invalid registered area population");
};
// A population slot may hold the rat, dog, roach, drone or salamander (populationSlot in rig-capabilities.json), not the wolf.
const isDrone = (foundationRef) => rigText(foundationRef, "brain") === "drone";
// Optional: absent means no hostile respawn. `seconds` is the play time a killed ordinary hostile stays down; excluded areas
// (the Westminster tutorial) never respawn. Bosses, the unique-reward holder and drones are kept permanent in code.
function validateRespawn(respawn, registry) {
  if (respawn === undefined) return;
  closed(respawn, ["seconds", "excludedAreas"]);
  const { seconds, excludedAreas } = respawn;
  if (!Number.isFinite(seconds) || seconds < 30 || seconds > 86400) fail();
  if (!Array.isArray(excludedAreas) || new Set(excludedAreas).size !== excludedAreas.length) fail();
  if (excludedAreas.some((id) => !registry.ids.includes(id))) fail();
}
// Keep the complete source identity/loot registry. Only fresh combat residents
// consume this policy, so removed placements in old death/award ledgers stay valid.
export function validatePopulationData(input, registry, residents, uniqueRewardData = null) {
  if (input === undefined) return null;
  closed(input, ["version", "maxHostilesPerArea", "areas"], ["respawn"]);
  if (input.version !== 1 || input.maxHostilesPerArea !== 6) fail();
  validateRespawn(input.respawn, registry);
  const populated = registry.ids.filter(
    (id) => (residents[id] ?? AREA_MOB_SPAWNS[id] ?? []).length || (AREA_DRONE_SPAWNS[id] ?? []).length,
  );
  closed(input.areas, populated);
  for (const [id, policy] of Object.entries(input.areas)) {
    closed(policy, ["activePlacementIds", "creatureSlot", "allowDroneFallback"]);
    const rows = residents[id] ?? AREA_MOB_SPAWNS[id] ?? [],
      drones = AREA_DRONE_SPAWNS[id] ?? [],
      active = policy.activePlacementIds;
    if (
      !Array.isArray(active) ||
      active.length < 1 ||
      active.length > input.maxHostilesPerArea ||
      new Set(active).size !== active.length ||
      active.some((key) => typeof key !== "string" || ![...rows, ...drones].some((row) => row.key === key))
    )
      fail();
    const protectedRows = rows.filter((row) => row.bossRef || row.key === uniqueRewardData?.placementKey);
    if (protectedRows.some((row) => !active.includes(row.key))) fail();
    const slot = policy.creatureSlot;
    closed(slot, ["placementKey", "cycles"]);
    closed(slot.cycles, ["A", "B"]);
    if (!active.includes(slot.placementKey) || protectedRows.some((row) => row.key === slot.placementKey)) fail();
    for (const spec of Object.values(slot.cycles)) {
      closed(spec, ["foundationRef", "recipeRef"]);
      if (!rigCapability(spec.foundationRef, "populationSlot")) fail();
      if (isDrone(spec.foundationRef)) {
        if (spec.recipeRef !== null || !drones.some((row) => row.key === slot.placementKey)) fail();
      } else if (
        typeof spec.recipeRef !== "string" ||
        creatureCatalogue.forRecipe(spec.recipeRef).runtimeIdentity !== spec.foundationRef
      )
        fail();
    }
    const drone = isDrone(slot.cycles.A.foundationRef);
    if (
      drone !== isDrone(slot.cycles.B.foundationRef) ||
      typeof policy.allowDroneFallback !== "boolean" ||
      policy.allowDroneFallback !== drone ||
      active.some((key) => drones.some((row) => row.key === key) && key !== slot.placementKey)
    )
      fail();
  }
  return freeze(structuredClone(input));
}
export function populationPlacements(policy, areaId, cycle, canonical) {
  const area = policy?.areas[areaId];
  if (!area) return canonical;
  const active = new Set(area.activePlacementIds),
    slot = area.creatureSlot,
    spec = slot.cycles[cycle ?? "A"];
  if (!spec) fail();
  return canonical
    .filter((row) => active.has(row.key))
    .map((row) => {
      if (row.key === slot.placementKey)
        return { ...row, foundationRef: spec.foundationRef, recipeRef: spec.recipeRef };
      if (
        areaId === "east" &&
        row.key === "east-roamer-8" &&
        rigText(row.foundationRef, "species") === "wolf" &&
        row.recipeRef === "wolf-east-guard"
      )
        return row;
      // Existing humans retain their exact health/appearance/scale allocation. A
      // former animal gets the shared Hollow factory without a stale animal recipe.
      if (row.foundationRef && row.foundationRef !== "hollow-scavenger") {
        const human = { ...row };
        delete human.foundationRef;
        delete human.recipeRef;
        return human;
      }
      return row;
    });
}
export function populationAllowsDrone(policy, areaId, key) {
  const area = policy?.areas[areaId];
  return (
    !area ||
    (area.allowDroneFallback && area.creatureSlot.placementKey === key && area.activePlacementIds.includes(key))
  );
}
