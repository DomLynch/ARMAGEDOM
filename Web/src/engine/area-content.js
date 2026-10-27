import { validateMarkedData } from "./marked.js";
import { validateCursedRelicData, validateCursedRelicGeometry } from "./cursed-relic.js";
import { validateReaperData } from "./reaper.js";
import { validateSafehouseData, validateSafehouseGeometry } from "./safehouse.js";
import { validateBossEquipmentData } from "./boss-equipment-data.js";
import { validateRifleData } from "./rifle-runtime.js";
import { validateFlameData, validateFlameGeometry } from "./flame-data.js";
import { AREA_DRONE_SPAWNS } from "../area-drone-spawns.js";
import { rigText } from "../rig-capabilities.js";
import { validatePopulationData } from "./area-population.js";
import { validateUniqueRewardData } from "./unique-reward-runtime.js";
import { validateAreaBosses, mergeBossResidents, validateBossGeometry } from "./area-bosses.js";
import { validateExpeditionData } from "./expedition-core.js";
import { AREA_MOB_SPAWNS, residentEncounterHealth } from "../area-mob-spawns.js";
import { validateGuidance, validateTutorialPath } from "./route-guidance.js";
import { closed, freeze } from "./content-schema.js";
export { closed, freeze } from "./content-schema.js";
import { validateProgressionPilot } from "./progression-rules.js";
import { validateAreaLoot } from "./area-loot.js";
import { validateAreaWater } from "./area-water.js";
import { validateAreaLighting } from "./area-lighting.js";
import { createGeometry } from "../world-geometry.js";
import { validateAreaEntries } from "../area-registry.js";
import { creatureCatalogue } from "./creature-catalogue.js";
import { DRONE_KEYS } from "../drone-mechanics.js";
import { ATMOSPHERE_PRESETS } from "../atmosphere-areas.js";
const fail = () => {
  throw Error("Invalid registered area content");
};
const object = (x) => x && Object.getPrototypeOf(x) === Object.prototype;
const key = (x) => typeof x === "string" && /^[a-z][a-z0-9-]*$/.test(x);
function point(p) {
  closed(p, ["x", "z"]);
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) fail();
}
export function validateResidentPlacements(
  rows,
  registry,
  layouts,
  { visibility = "public", geometryValidation = true } = {},
) {
  if (!object(rows) || !object(layouts)) fail();
  const residents = structuredClone(rows),
    keys = new Set(),
    geometry = new Map();
  if (geometryValidation)
    for (const id of registry.ids) {
      const ref = registry.get(id).layoutRef;
      if (!geometry.has(ref)) {
        if (!Object.hasOwn(layouts, ref)) fail();
        geometry.set(ref, createGeometry(layouts[ref]));
      }
    }
  if (geometryValidation) validateAreaEntries(registry, geometry);
  for (const [area, placements] of Object.entries(residents)) {
    if (!registry.has(area) || registry.get(area).visibility !== visibility || !Array.isArray(placements)) fail();
    const g = geometry.get(registry.get(area).layoutRef);
    for (const row of placements) {
      closed(row, ["key", "foundationRef", "recipeRef", "pos", "patrol"], ["appearanceRef", "encounter"]);
      if (
        !key(row.key) ||
        keys.has(row.key) ||
        (visibility === "private" && !row.key.startsWith("fixture-")) ||
        (Object.hasOwn(row, "appearanceRef") && !key(row.appearanceRef))
      )
        fail();
      keys.add(row.key);
      const foundation = creatureCatalogue.get(row.foundationRef);
      residentEncounterHealth(row, foundation.stats.health);
      if (rigText(foundation.runtimeIdentity, "brain") === "drone" && DRONE_KEYS[row.key] !== area)
        throw Error("Unsupported declared drone death placement");
      if (creatureCatalogue.forRecipe(row.recipeRef).id !== foundation.id) fail();
      point(row.pos);
      if (!Array.isArray(row.patrol) || row.patrol.length < 2) fail();
      row.patrol.forEach(point);
      const radius = foundation.stats.radius;
      if (g) validateResidentGeometry(row, g, radius);
    }
  }
  return freeze(residents);
}
function validateResidentGeometry(row, g, radius) {
  if (!g.clear(row.pos, radius) || row.patrol.some((p) => !g.clear(p, radius))) fail();
  for (let i = 0; i < row.patrol.length; i++) {
    const a = row.patrol[i],
      b = row.patrol[(i + 1) % row.patrol.length],
      steps = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.2));
    for (let n = 0; n <= steps; n++)
      if (!g.clear({ x: a.x + ((b.x - a.x) * n) / steps, z: a.z + ((b.z - a.z) * n) / steps }, radius)) fail();
  }
}
export function validateAreaGeometry(
  registry,
  areaId,
  layout,
  residents = null,
  expedition = null,
  bossData = null,
  populationData = null,
  flameData = null,
  safehouseData = null,
  cursedRelicData = null,
) {
  if (layout.portraitScale !== undefined && !(Number.isFinite(layout.portraitScale) && layout.portraitScale > 0))
    throw Error("Layout portraitScale must be a finite number above 0");
  const g = createGeometry(layout),
    area = registry.get(areaId);
  validateSafehouseGeometry(safehouseData, areaId, g, residents?.[areaId] ?? []);
  validateBossGeometry(bossData, areaId, g, registry);
  validateFlameGeometry(flameData, registry, areaId, g);
  validateCursedRelicGeometry(cursedRelicData, areaId, g);
  validateGuidance(layout, g, registry.links(areaId));
  const tutorial = validateTutorialPath(layout, g);
  if (tutorial) {
    if (areaId !== "westminster") throw Error("Tutorial must belong to Westminster");
    // The tutorial ends on the Westminster steps, where the named set-piece slot sits (empty until its contents are authored).
    const slot = layout.setPieceSlot?.at,
      end = layout.tutorialPath.at(-1);
    if (!slot || Math.hypot(slot.x - end.x, slot.y - end.y) > 1e-8)
      throw Error("Tutorial must reach the Westminster set-piece slot");
  }
  if (expedition) {
    for (const anchor of [expedition.contract.giver, expedition.contract.case])
      if (anchor.areaId === areaId) {
        if (!g.clear(anchor.position, 0.4)) throw Error("Blocked expedition interaction");
        for (let i = 0; i < 16; i++) {
          const angle = (i * Math.PI) / 8,
            p = {
              x: anchor.position.x + Math.cos(angle) * anchor.radius,
              z: anchor.position.z + Math.sin(angle) * anchor.radius,
            };
          if (!g.clear(p, 0.4) || !g.lineClear(p, anchor.position))
            throw Error("Blocked expedition interaction approach");
        }
      }
    const guard = expedition.contract.guard;
    if (
      guard.areaId === areaId &&
      !(residents?.[areaId] ?? AREA_MOB_SPAWNS[areaId] ?? []).some((row) => row.key === guard.placementKey)
    )
      throw Error("Unknown expedition guard placement");
  }
  const population = populationData?.areas[areaId];
  if (population) {
    const slot = population.creatureSlot,
      row = [...(residents?.[areaId] ?? AREA_MOB_SPAWNS[areaId] ?? []), ...(AREA_DRONE_SPAWNS[areaId] ?? [])].find(
        (row) => row.key === slot.placementKey,
      ),
      radius = Math.max(
        ...Object.values(slot.cycles).map((spec) => creatureCatalogue.get(spec.foundationRef).stats.radius),
      );
    if (!row) fail();
    validateResidentGeometry(row, g, radius);
  }
  const entries = [
    area.entry,
    ...registry.ids.flatMap((id) =>
      registry
        .links(id)
        .filter((link) => link.to === areaId)
        .map((link) => link.entry),
    ),
  ];
  if (entries.some((entry) => !g.clear(g.ground(entry), 0.4))) throw Error("London entry is blocked");
  // Boss merging also exposes the trusted legacy human rows used by declaredResident.
  for (const row of residents?.[areaId] ?? [])
    validateResidentGeometry(row, g, creatureCatalogue.get(row.foundationRef ?? "hollow-scavenger").stats.radius);
  return Object.isFrozen(layout) ? layout : freeze(structuredClone(layout));
}
function validateAtmosphere(rows, registry) {
  if (!object(rows)) fail();
  const result = structuredClone(rows),
    ids = new Set();
  for (const [area, data] of Object.entries(result)) {
    if (!registry.has(area) || registry.get(area).visibility !== "public") fail();
    closed(data, ["anchors", "budget"]);
    closed(data.budget, ["quads", "drawCalls", "textureBytes"]);
    if (
      !Array.isArray(data.anchors) ||
      !Number.isInteger(data.budget.quads) ||
      data.budget.quads < 0 ||
      data.budget.quads > 28 ||
      !Number.isInteger(data.budget.drawCalls) ||
      data.budget.drawCalls < 0 ||
      data.budget.drawCalls > 3 ||
      data.budget.textureBytes !== 0
    )
      fail();
    let quads = 0;
    for (const row of data.anchors) {
      closed(
        row,
        ["id", "preset", "x", "y", "foot", "depth", "seed", "scale", "intensity", "preserve"],
        ["width", "rise", "smoke", "opacity", "fireWidth", "fireHeight", "embers", "smokeColor"],
      );
      if (!key(row.id) || ids.has(row.id) || !Object.hasOwn(ATMOSPHERE_PRESETS, row.preset) || row.preserve !== true)
        fail();
      ids.add(row.id);
      if (
        ![row.x, row.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1) ||
        !Number.isInteger(row.seed) ||
        row.seed < 0 ||
        row.seed > 4294967295 ||
        !Number.isFinite(row.scale) ||
        row.scale <= 0 ||
        row.scale > 2 ||
        !Number.isFinite(row.intensity) ||
        row.intensity < 0 ||
        row.intensity > 1
      )
        fail();
      if (row.foot) {
        closed(row.foot, ["x", "y"]);
        if (!Object.values(row.foot).every((n) => Number.isFinite(n) && n >= 0 && n <= 1) || row.depth !== null) fail();
      } else if (!Number.isFinite(row.depth) || row.depth <= 0) fail();
      const p = { ...ATMOSPHERE_PRESETS[row.preset], ...row };
      for (const field of ["width", "rise", "opacity", "fireWidth", "fireHeight"])
        if (!Number.isFinite(p[field]) || p[field] < 0 || p[field] > (field === "opacity" ? 1 : 0.15)) fail();
      if (
        !Number.isInteger(p.smoke) ||
        p.smoke < 0 ||
        p.smoke > 4 ||
        !Number.isInteger(p.embers) ||
        p.embers < 0 ||
        p.embers > 2 ||
        (p.smokeColor &&
          (!Array.isArray(p.smokeColor) ||
            p.smokeColor.length !== 3 ||
            !p.smokeColor.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)))
      )
        fail();
      quads += p.smoke + (p.fireHeight > 0 ? 1 : 0) + p.embers;
    }
    if (quads > data.budget.quads || (quads > 0 && data.budget.drawCalls < 3)) fail();
  }
  return freeze(result);
}
export function validateAreaContent(content, registry, layouts) {
  closed(
    content,
    ["residents", "atmosphere"],
    [
      "lighting",
      "water",
      "loot",
      "progression",
      "expedition",
      "bosses",
      "uniqueReward",
      "population",
      "flame",
      "rifle",
      "bossEquipment",
      "safehouse",
      "reaper",
      "marked",
      "cursedRelic",
    ],
  );
  const original = validateResidentPlacements(content.residents, registry, layouts),
    bossData = validateAreaBosses(content.bosses, registry, original),
    residents = mergeBossResidents(original, bossData, registry),
    uniqueRewardData = validateUniqueRewardData(content.uniqueReward, registry, residents),
    flameData = validateFlameData(content.flame, registry);
  if (flameData)
    validateFlameGeometry(
      flameData,
      registry,
      flameData.areaId,
      createGeometry(layouts[registry.get(flameData.areaId).layoutRef]),
    );
  return Object.freeze({
    markedData: validateMarkedData(content.marked, registry),
    cursedRelicData: validateCursedRelicData(content.cursedRelic, registry),
    reaperData: validateReaperData(content.reaper, content.expedition),
    safehouseData: validateSafehouseData(content.safehouse, registry),
    bossEquipmentData: validateBossEquipmentData(content.bossEquipment, registry, residents),
    rifleData: validateRifleData(content.rifle, registry, residents),
    flameData,
    uniqueRewardData,
    populationData: validatePopulationData(content.population, registry, residents, uniqueRewardData),
    ...(bossData ? { bossData } : {}),
    ...(content.expedition === undefined ? {} : { expedition: validateExpeditionData(content.expedition, registry) }),
    progression: content.progression === undefined ? null : validateProgressionPilot(content.progression),
    lootRules: validateAreaLoot(content.loot, registry, residents),
    water: validateAreaWater(content.water, registry),
    lighting: validateAreaLighting(content.lighting, registry),
    residents,
    atmosphere: validateAtmosphere(content.atmosphere, registry),
    layouts: freeze(structuredClone(layouts)),
  });
}

export function validateAreaMetadata(content, registry) {
  closed(
    content,
    ["residents", "atmosphere"],
    [
      "lighting",
      "water",
      "loot",
      "progression",
      "expedition",
      "bosses",
      "uniqueReward",
      "population",
      "flame",
      "rifle",
      "bossEquipment",
      "safehouse",
      "reaper",
      "marked",
      "cursedRelic",
    ],
  );
  const original = validateResidentPlacements(content.residents, registry, {}, { geometryValidation: false }),
    bossData = validateAreaBosses(content.bosses, registry, original),
    residents = mergeBossResidents(original, bossData, registry),
    uniqueRewardData = validateUniqueRewardData(content.uniqueReward, registry, residents);
  return Object.freeze({
    markedData: validateMarkedData(content.marked, registry),
    cursedRelicData: validateCursedRelicData(content.cursedRelic, registry),
    reaperData: validateReaperData(content.reaper, content.expedition),
    safehouseData: validateSafehouseData(content.safehouse, registry),
    bossEquipmentData: validateBossEquipmentData(content.bossEquipment, registry, residents),
    rifleData: validateRifleData(content.rifle, registry, residents),
    flameData: validateFlameData(content.flame, registry),
    uniqueRewardData,
    populationData: validatePopulationData(content.population, registry, residents, uniqueRewardData),
    ...(bossData ? { bossData } : {}),
    ...(content.expedition === undefined ? {} : { expedition: validateExpeditionData(content.expedition, registry) }),
    progression: content.progression === undefined ? null : validateProgressionPilot(content.progression),
    lootRules: validateAreaLoot(content.loot, registry, residents),
    water: validateAreaWater(content.water, registry),
    lighting: validateAreaLighting(content.lighting, registry),
    residents,
    atmosphere: validateAtmosphere(content.atmosphere, registry),
  });
}
