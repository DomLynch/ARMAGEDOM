// The always-drop weapon sources of the validated game content: boss equipment, the rifle and the unique reward. The ONLY place that knows where the
// game keeps them: today they are bossEquipmentData / rifleData / uniqueRewardData on the validated area content; when they move to JSON under
// Web/public/world/ only this import path changes. Imported, never copied: no item id or placement is typed here.
export function weaponLootSources(content) {
  const sources = [];
  for (const row of Object.values(content.bossEquipmentData ?? {})) sources.push({ areaId: row.source.areaId, placementKey: row.source.placementKey, itemId: row.itemId });
  if (content.rifleData?.source) sources.push({ areaId: content.rifleData.source.areaId, placementKey: content.rifleData.source.placementKey, itemId: content.rifleData.itemId });
  if (content.uniqueRewardData) sources.push({ areaId: content.uniqueRewardData.areaId, placementKey: content.uniqueRewardData.placementKey, itemId: content.uniqueRewardData.itemId });
  return sources;
}
