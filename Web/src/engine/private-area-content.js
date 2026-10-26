import { validateAreaLoot } from "./area-loot.js";
import { validateAreaWater } from "./area-water.js";
import { validateAreaLighting } from "./area-lighting.js";
import { createAreaRegistry } from "../area-registry.js";
import { closed, freeze, validateResidentPlacements } from "./area-content.js";
import { GAME_DATA } from "./game-data.js";
const MIB = 1024 * 1024; // tuning-ok: bytes in a MiB, a unit conversion
// A private area's texture budget may not go below or above the public one (data/areaRuntime.json `view`).
const BUDGET = GAME_DATA.areaRuntime.view;
// Explicit private entry isolates both current and legacy save keys before IO.
export function preparePrivateAreaContent(content) {
  closed(
    content,
    ["areas", "manifest", "residents", "layouts", "namespace", "textureBudgetBytes"],
    ["lighting", "water", "loot"],
  );
  if (
    typeof content.namespace !== "string" ||
    !/^armagedom:private:[a-z0-9-]+:$/.test(content.namespace) ||
    !Number.isFinite(content.textureBudgetBytes) ||
    content.textureBudgetBytes < BUDGET.textureBudgetMinMiB * MIB ||
    content.textureBudgetBytes > BUDGET.textureBudgetMiB * MIB
  )
    throw Error("Invalid private area content");
  const registry = createAreaRegistry({ areas: content.areas, manifest: content.manifest, includePrivate: true });
  if (!registry.ids.some((id) => registry.get(id).visibility === "private")) throw Error("Private area required");
  const residents = validateResidentPlacements(content.residents, registry, content.layouts, { visibility: "private" });
  return Object.freeze({
    lootRules: validateAreaLoot(content.loot, registry, residents),
    water: validateAreaWater(content.water, registry, { privatePilot: true }),
    lighting: validateAreaLighting(content.lighting, registry),
    registry,
    manifest: freeze(structuredClone(content.manifest)),
    residents,
    layouts: freeze(structuredClone(content.layouts)),
    namespace: content.namespace,
    textureBudgetBytes: content.textureBudgetBytes,
  });
}
export function namespacedRunStorage(storage, namespace) {
  if (!storage) return null;
  return Object.freeze({
    getItem: (key) => storage.getItem(namespace + key),
    setItem: (key, value) => storage.setItem(namespace + key, value),
  });
}
