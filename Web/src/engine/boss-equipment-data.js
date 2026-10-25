import { BONE_SAW_RULES } from "./bone-saw.js";
import { GAME_DATA } from "./game-data.js";
import { RANGED_WEAPON_CATALOG } from "./weapon-catalog.js";
import { closedData } from "./progression-state.js";
// The six boss-reward profiles, built from weapons.json `bossEquipment` (field order, the four ranged catalogue rows by id, the
// Bone Saw and Ember Projector rows). The Bone Saw's rules are the continuous-melee rules plus its pickup radius.
function buildBossEquipmentProfiles() {
  const data = GAME_DATA.weapons.bossEquipment,
    { pickupRadius, source, ...saw } = data.surgicalKnife,
    profiles = {
      ...Object.fromEntries(
        Object.entries(data.ranged).map(([field, itemId]) => [field, RANGED_WEAPON_CATALOG[itemId]]),
      ),
      surgicalKnife: Object.freeze({
        ...saw,
        rules: Object.freeze({ ...BONE_SAW_RULES, pickupRadius }),
        source,
      }),
      emberProjector: data.emberProjector,
    };
  return Object.freeze(Object.fromEntries(data.order.map((field) => [field, profiles[field]])));
}
export const BOSS_EQUIPMENT_PROFILES = buildBossEquipmentProfiles();
export const SURGEON_KNIFE_PROFILE = BOSS_EQUIPMENT_PROFILES.surgicalKnife;
export const EMBER_PROJECTOR_PROFILE = BOSS_EQUIPMENT_PROFILES.emberProjector;
export function validateBossEquipmentData(input, registry, residents) {
  if (input === undefined) return null;
  if (!closedData(input, ["version"]) || input.version !== 1) throw TypeError("Invalid boss equipment selection");
  for (const data of Object.values(BOSS_EQUIPMENT_PROFILES))
    if (
      !registry.has(data.source.areaId) ||
      !(residents[data.source.areaId] ?? []).some((row) => row.key === data.source.placementKey)
    )
      throw TypeError("Unknown equipment reward source");
  for (const areaId of registry.ids)
    for (const link of registry.links(areaId))
      if (
        link.requiresDefeat &&
        !Object.values(BOSS_EQUIPMENT_PROFILES).some(
          (data) => registry.has(data.source.areaId) && data.source.placementKey === link.requiresDefeat,
        )
      )
        throw TypeError("Unknown exit defeat source");
  return BOSS_EQUIPMENT_PROFILES;
}
export function bossEquipmentClock(g, field) {
  const clocks = g.bossEquipmentAction ?? (g.bossEquipmentAction = {});
  return clocks[field] ?? (clocks[field] = { nextFireAt: 0, reloadingUntil: 0, firedAt: -1 });
}

export function selectedFlameProfile(g) {
  const base = g.world.flameData,
    data = g.world.bossEquipmentData?.emberProjector,
    state = g.bossEquipment?.emberProjector;
  return data && state?.status === "owned" && state.selected && state.rewardReceipt === data.source.receiptId
    ? {
        ...base,
        name: data.name,
        unitsPerSecond: data.rules.unitsPerSecond,
        saveCoalesceSeconds: data.rules.saveCoalesceSeconds,
        contact: { ...base.contact, damage: data.rules.damage },
      }
    : base;
}

// Access to the shared historical fuel family never proves the Witch reward.
export function ownsEmberReward(g) {
  const p = g.world?.bossEquipmentData?.emberProjector,
    s = g.bossEquipment?.emberProjector;
  return !!p && s?.status === "owned" && s.rewardReceipt === p.source.receiptId;
}
