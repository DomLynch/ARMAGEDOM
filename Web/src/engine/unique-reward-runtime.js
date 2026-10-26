import { closedData } from "./progression-state.js";
import { freeze } from "./content-schema.js";
import { GAME_DATA } from "./game-data.js";
import { AREA_MOB_SPAWNS } from "../area-mob-spawns.js";
export const CLEAVER_ITEM_ID = "hale-pitborn-cleaver-v1";
// Registered item/source identity. Views and the single Core writer consume this data.
export const UNIQUE_REWARDS = freeze({
  [CLEAVER_ITEM_ID]: {
    itemId: CLEAVER_ITEM_ID,
    name: "Pitborn Cleaver",
    areaId: "east",
    placementKey: "east-roamer-2",
    baseVariantId: "knife",
    modelRef: "vagrant-cleaver",
    receiptId: "east-roamer-2:" + CLEAVER_ITEM_ID,
  },
});
export function validateUniqueRewardData(input, registry, residents) {
  if (input === undefined) return null;
  if (
    !closedData(input, ["version", "itemId"]) ||
    input.version !== 1 ||
    typeof input.itemId !== "string" ||
    !Object.hasOwn(UNIQUE_REWARDS, input.itemId)
  )
    throw TypeError("Invalid unique reward catalogue");
  const row = UNIQUE_REWARDS[input.itemId];
  if (
    !registry.has(row.areaId) ||
    !(residents[row.areaId] ?? AREA_MOB_SPAWNS[row.areaId] ?? []).some((p) => p.key === row.placementKey)
  )
    throw TypeError("Unknown unique reward source");
  return row;
}
export function uniqueRewardSourceDead(saved, data) {
  return !!(
    saved.progression?.awards?.some((row) => row.placementKey === data.placementKey && row.areaId === data.areaId) ||
    saved.supplies?.issued?.includes(data.placementKey)
  );
}
export function uniqueRewardDropPosition(g, corpse, data = g.world.uniqueRewardData) {
  const origin = corpse.pos,
    w = g.world;
  if (
    !data ||
    w.areaId !== data.areaId ||
    corpse.placementKey !== data.placementKey ||
    corpse.hp > 0 ||
    ![origin?.x, origin?.z].every(Number.isFinite)
  )
    return null;
  const ground = (p) => w.geometry.clear(p, 0.4) && !w.travelAt?.(p),
    legal = (p) => ground(p) && w.lineClear(origin, p);
  if (legal(origin)) return { x: origin.x, z: origin.z };
  const ring = (radii, accept) => {
    for (const radius of radii)
      for (let i = 0; i < 16; i++) {
        const angle = (i * Math.PI) / 8,
          p = { x: origin.x + Math.cos(angle) * radius, z: origin.z + Math.sin(angle) * radius };
        if (accept(p)) return p;
      }
    return null;
  };
  // A corpse against a wall or exit has no spot within 1 m; widen, then drop the corpse line (pickup only needs player-to-spot clearance), then use the area entry.
  const { nearRadii, fallbackRadii } = GAME_DATA.uniqueReward.dropSearch; // data/uniqueReward.json
  const near = ring(nearRadii, legal) ?? ring(fallbackRadii, legal) ?? ring(fallbackRadii, ground);
  if (near) return near;
  // The registry entry is a normalized artwork point; geometry.ground maps it to world metres (as world.js does).
  const entry = w.registry?.get?.(w.areaId)?.entry,
    spot = entry && w.geometry.ground?.(entry);
  return spot && ground(spot) ? { x: spot.x, z: spot.z } : null;
}
// Boss-equipment sources follow the same rule: an uncommitted kill must not be left behind in a parked area.
function needsBossEquipmentDeathCommit(g) {
  const w = g?.world,
    rows = [
      ...Object.entries(w?.bossEquipmentData ?? {}).map(([field, data]) => [data?.source, g.bossEquipment?.[field]]),
      [w?.rifleData?.source, g?.rifle],
    ];
  return rows.some(([s, state]) => {
    return (
      !!s &&
      w.areaId === s.areaId &&
      (!state || ["eligible", "legacy-dead"].includes(state.status)) &&
      !g.progression?.awards?.some((row) => row.placementKey === s.placementKey && row.areaId === s.areaId) &&
      g.corpses?.some((e) => e.placementKey === s.placementKey && e.hp <= 0)
    );
  });
}
export function needsUniqueDeathCommit(g) {
  if (needsBossEquipmentDeathCommit(g)) return true;
  const data = g?.world?.uniqueRewardData,
    state = g?.uniqueReward;
  return !!(
    data &&
    g.world.areaId === data.areaId &&
    (!state || ["eligible", "legacy-dead"].includes(state.status)) &&
    !g.progression?.awards?.some((row) => row.placementKey === data.placementKey && row.areaId === data.areaId) &&
    g.corpses?.some((e) => e.placementKey === data.placementKey && e.hp <= 0)
  );
}
