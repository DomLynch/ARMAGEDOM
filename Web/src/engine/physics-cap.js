// The dying-ragdoll caps by device quality tier (data/physicsBudget.json `tiers`). The cap never exceeds what the device can take: until the quality
// probe has resolved (`quality.settled()`, the first ~240 frames) the `pendingTier` row is in force (today's low cap); once it resolves, that tier's
// row. The effective cap only ever goes DOWN in a session (the minimum of every row that was in force), never up. `quality` has row().name, settled().
export function createTierCaps(tiers, pendingTier, quality) {
  let cap = null;
  return () => {
    const row = tiers[quality.settled() ? quality.row().name : pendingTier];
    cap = cap ? { humanoid: Math.min(cap.humanoid, row.humanoid), boss: Math.min(cap.boss, row.boss) } : row;
    return cap;
  };
}
