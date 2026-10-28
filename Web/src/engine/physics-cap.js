// The dying-ragdoll caps by device quality tier (data/physicsBudget.json `tiers`). The row is read ONCE, at the first death of the session, and
// kept: the quality tier can step down once after its frame sample, but the cap never changes under a live pool. `quality` is anything with row().name.
export function createTierCaps(tiers, quality) {
  let row = null;
  return () => (row ??= tiers[quality.row().name]);
}
