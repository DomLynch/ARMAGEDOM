import { webText } from "./web-text.js";
import { buildGoalBoss } from "./area-residents.js";
import { BOSS_GOALS, bossGoalsEnabled, activeGoal, countsFor } from "./boss-goal-core.js";

// BOSS UNLOCK GOALS (data/bossGoals.json), opt-in with ?bossgoals=1. The step runs once per simulation step (loop.js, beside the post-boss
// raid). With the switch off it returns at once and creates nothing. On, it counts the qualifying kills made in a boss's own area against
// that boss's goal; the step that fills the counter builds the boss (area-residents.js buildGoalBoss), stands it beside the player, wakes
// it, announces it and raises a "boss-goal-complete" event (a screen shake through gameFeel.json). State is `g.bossGoals`: session only,
// never saved, never sent.
const TURN = (Math.PI / 180) * 360; // one full turn in radians

function newState() {
  return { progress: {}, done: {}, seen: new WeakSet(), flourish: null };
}

// A clear spot `distance` from the player, trying the way the player faces first and turning round from there; the boss keeps the spot
// it was built on (its own pocket) when none is clear. The spot becomes its home so a leash never drags it back out of the fight.
function stand(g, boss, rules) {
  const world = g.world,
    from = g.player.pos,
    facing = g.player.facing,
    base = facing && (facing.x || facing.z) ? Math.atan2(facing.z, facing.x) : 0;
  for (let i = 0; i < rules.summon.attempts; i++) {
    const angle = base + (i * TURN) / rules.summon.attempts,
      spot = {
        x: from.x + Math.cos(angle) * rules.summon.distance,
        z: from.z + Math.sin(angle) * rules.summon.distance,
      };
    if (!world.geometry?.clear(spot, boss.radius) || !world.lineClear(from, spot) || world.travelAt?.(spot)) continue;
    boss.pos = spot;
    boss.home = { ...spot };
    boss.patrol = [{ ...spot }, { ...spot }];
    break;
  }
  boss.alerted = true;
  boss.returning = false;
}

function complete(g, state, goal, rules) {
  state.done[goal.key] = true;
  const boss = buildGoalBoss(g, goal.key);
  if (!boss) return;
  stand(g, boss, rules);
  g.enemies.push(boss);
  g.encounterActive = true;
  g.encounterCleared = false;
  const line = webText(`bossGoal.${goal.row.id}.arrive`);
  state.flourish = { key: goal.key, text: line, until: g.time + rules.flourish.seconds };
  g.message = line;
  g.messageUntil = g.time + rules.flourish.messageSeconds;
  g.events.push({ type: "boss-goal-complete", actor: boss, placementKey: goal.key, name: boss.bossName });
}

// After each simulation step. Returns the state (null while goals are off or nothing has happened yet).
export function stepBossGoals(g, rules = BOSS_GOALS, search = undefined) {
  if (!bossGoalsEnabled(rules, search) || !g?.world) return null;
  const goal = activeGoal(g, rules, search);
  if (!goal) return g.bossGoals ?? null;
  const state = (g.bossGoals ??= newState());
  if (goal.done) return state;
  for (const e of g.events ?? []) {
    if (e.type !== "death" || state.seen.has(e)) continue;
    state.seen.add(e);
    if (countsFor(goal.row, e.actor))
      state.progress[goal.key] = Math.min(goal.kills, (state.progress[goal.key] ?? 0) + 1);
  }
  if ((state.progress[goal.key] ?? 0) >= goal.kills) complete(g, state, goal, rules);
  return state;
}
