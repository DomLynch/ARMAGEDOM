import { closedData } from "./progression-state.js";
import { RIFLE_ITEM_ID, RIFLE_PROFILE } from "./weapon-catalog.js";
export function validateRifleData(input, registry, residents) {
  if (input === undefined) return null;
  if (!closedData(input, ["version", "itemId"]) || input.version !== 1 || input.itemId !== RIFLE_ITEM_ID)
    throw TypeError("Invalid rifle catalogue selection");
  const source = RIFLE_PROFILE.source;
  if (!registry.has(source.areaId) || !(residents[source.areaId] ?? []).some((row) => row.key === source.placementKey))
    throw TypeError("Unknown rifle reward source");
  return RIFLE_PROFILE;
}
export function rifleActionState(g) {
  return g.rifleAction ?? (g.rifleAction = { nextFireAt: 0, reloadingUntil: 0, firedAt: -1 });
}
