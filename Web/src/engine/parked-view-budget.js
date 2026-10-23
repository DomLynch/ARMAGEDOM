// Parked actor views from areas the player has left count against one geometry budget.
// When preparing a new area would exceed it, drop whole parked areas, least recently
// parked first, instead of failing travel. Never the area being prepared, the player's
// current area or any area with preparation under way. A discarded area is marked not
// ready so returning to it rebuilds its views through prepareAreaSteps; its residents
// and corpses live in the game record, so nothing the player did is lost.
export function relieveGeometryBudget(actors, keep, onEvict = () => {}) {
  const over = () => {
    const memory = actors.areaViewStats();
    return memory.ownedFinisherGeometryBytes > memory.finisherGeometryBudgetBytes;
  };
  const evicted = [];
  if (!over()) return evicted;
  for (const row of actors.areaViewStats().parked) {
    if (!over()) break;
    if (keep.has(row.area) || !row.count) continue;
    actors.discardArea(row.area);
    onEvict(row.area);
    evicted.push(row.area);
  }
  if (over()) throw Error("Prepared actor geometry budget exceeded");
  return evicted;
}
// Areas whose views or preparation must stay put while another area is prepared.
export function protectedAreas(state, currentArea, preparingArea) {
  const keep = new Set([currentArea, preparingArea]);
  if (state.urgent) keep.add(state.urgent);
  for (const [id, task] of state.tasks) if (["queued", "running", "prepared"].includes(task.status)) keep.add(id);
  return keep;
}
