import { webText } from "./web-text.js";
import { BOSS_GOALS, bossGoalsEnabled, activeGoal } from "./boss-goal-core.js";

// The boss goal's screen parts (index.html #boss-goal, #boss-goal-flash; style.css): a small progress ring with the goal's label in the HUD
// column, and a banner with a short screen pulse when the counter fills. Built by the browser loop only with ?bossgoals=1; with the switch
// off there is no view at all. Every node write is guarded, so a steady frame changes nothing. Ring geometry and colours are CSS.
const inert = { frame() {}, dispose() {} };

export function createBossGoalView({ doc = globalThis.document, rules = BOSS_GOALS, search = undefined } = {}) {
  if (!bossGoalsEnabled(rules, search)) return inert;
  const el = (id) => (typeof doc?.getElementById === "function" ? doc.getElementById(id) : null),
    root = el("boss-goal"),
    label = el("boss-goal-text"),
    count = el("boss-goal-count"),
    flash = el("boss-goal-flash"),
    title = el("boss-goal-flash-title");
  if (!root || !label || !count || !flash || !title) return inert;
  let shown = "",
    flashKey = null;
  const paint = (node, value) => {
    if (node.textContent !== value) node.textContent = value;
  };
  return {
    // Every frame, with the live game: the ring while this area's boss is still locked, the banner while the flourish lasts.
    frame(g, hold = false) {
      const goal = !hold && g ? activeGoal(g, rules, search) : null,
        open = !!goal && !goal.done && !g.finished,
        part = open ? `${goal.key}:${goal.progress}` : "";
      if (part !== shown) {
        shown = part;
        root.hidden = !open;
        if (open) {
          paint(label, webText(`bossGoal.${goal.row.id}.hud`));
          paint(count, webText("bossGoal.count", { done: goal.progress, total: goal.kills }));
          root.style.setProperty("--goal", String(goal.progress / goal.kills));
        }
      }
      const f = !hold && g?.bossGoals?.flourish && g.time < g.bossGoals.flourish.until ? g.bossGoals.flourish : null,
        key = f ? f.key : null;
      if (key !== flashKey) {
        flashKey = key;
        flash.hidden = !f;
        if (f) paint(title, f.text);
      }
    },
    dispose() {
      root.hidden = true;
      flash.hidden = true;
    },
  };
}
