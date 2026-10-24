// The always-drop weapon sources of the validated game content: boss equipment, the rifle and the unique reward. The ONLY place that knows where the
// game keeps them: today they are bossEquipmentData / rifleData / uniqueRewardData on the validated area content; when they move to JSON under
// Web/public/world/ only this import path changes. Imported, never copied: no item id, placement or record path is typed here except the layer names
// the save record itself uses ("rifle", "bossEquipment.<field>", "uniqueReward").
// path = where the save record keeps the item's state (record.<path>.status is "owned" once the player holds it).
export function weaponLootSources(content) {
  const sources = [];
  for (const [field, row] of Object.entries(content.bossEquipmentData ?? {}))
    sources.push({ path: `bossEquipment.${field}`, areaId: row.source.areaId, placementKey: row.source.placementKey, itemId: row.itemId });
  if (content.rifleData?.source) sources.push({ path: "rifle", areaId: content.rifleData.source.areaId, placementKey: content.rifleData.source.placementKey, itemId: content.rifleData.itemId });
  if (content.uniqueRewardData) sources.push({ path: "uniqueReward", areaId: content.uniqueRewardData.areaId, placementKey: content.uniqueRewardData.placementKey, itemId: content.uniqueRewardData.itemId });
  return sources;
}
