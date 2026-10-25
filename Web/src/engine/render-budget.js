// Compares two measurements from scripts/remote-cost.mjs (the same scene with no remote players and with some) to the budget in
// Web/src/data/renderBudget.json. Pure: it returns the list of problems, empty when the cost is within budget.
import { GAME_DATA } from "./game-data.js";

/** zero / loaded: { drawCalls, triangles, remotes } as the ?stats=1 line reports them. */
export function remoteCostProblems(zero, loaded, budget = GAME_DATA.renderBudget) {
  const problems = [];
  if (!zero || !loaded || zero.remotes !== 0) return ["needs a measurement with 0 remotes and one with remotes"];
  if (!(loaded.remotes > 0)) return ["the loaded measurement shows no remote players on screen"];
  const perCalls = (loaded.drawCalls - zero.drawCalls) / loaded.remotes,
    perTriangles = (loaded.triangles - zero.triangles) / loaded.remotes;
  if (perCalls > budget.perRemote.maxDrawCalls)
    problems.push(`each remote costs ${perCalls.toFixed(2)} draw calls, budget ${budget.perRemote.maxDrawCalls}`);
  if (perTriangles > budget.perRemote.maxTriangles)
    problems.push(`each remote costs ${Math.round(perTriangles)} triangles, budget ${budget.perRemote.maxTriangles}`);
  // The scene total is judged at the budget's remote count, projected from the measurement when it used fewer or more.
  const { remotes, maxDrawCalls, maxTriangles } = budget.westminster,
    calls = zero.drawCalls + perCalls * remotes,
    triangles = zero.triangles + perTriangles * remotes;
  if (calls > maxDrawCalls) problems.push(`${Math.round(calls)} draw calls with ${remotes} remotes, budget ${maxDrawCalls}`);
  if (triangles > maxTriangles)
    problems.push(`${Math.round(triangles)} triangles with ${remotes} remotes, budget ${maxTriangles}`);
  return problems;
}
