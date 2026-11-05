import { GAME_DATA } from "./game-data.js";

// Pure parts of the boss unlock goals (data/bossGoals.json): the page switch, which goal belongs to the area, whether a boss is still
// locked and which kills count. Nothing here changes the game or touches the scene, so the resident builder (area-residents.js) can ask
// it and the tests can use it without loading actors. With ?bossgoals=1 absent every answer below is "no goal, nothing locked".
export const BOSS_GOALS = GAME_DATA.bossGoals;

// The page's switch, worked out once per rules row (the address never changes in a page). `search` is for tests. Goals are off unless the
// data says bossGoalsEnabledDefault or the address carries the start switch (?bossgoals=1).
const pageOn = new WeakMap();
export function bossGoalsEnabled(rules = BOSS_GOALS, search = undefined) {
  const read = (query) =>
    rules.enabled &&
    (rules.bossGoalsEnabledDefault ||
      new URLSearchParams(query).get(rules.startSwitch.param) === rules.startSwitch.value);
  if (search !== undefined) return read(search);
  if (!pageOn.has(rules)) pageOn.set(rules, read(globalThis.location?.search ?? ""));
  return pageOn.get(rules);
}

// The goal row guarding the boss placed with `key`, or undefined (also while goals are off).
export const goalOfPlacement = (key, rules = BOSS_GOALS, search = undefined) =>
  bossGoalsEnabled(rules, search) ? rules.goals.find((row) => row.placementKey === key) : undefined;

// True while the boss placed with `key` must stay out of its area: goals on, a goal for it, and that goal not yet met this session.
// The state is `g.bossGoals`, made by the step (boss-goals.js); until it exists every goal is unmet.
export const bossGoalLocks = (g, key, rules = BOSS_GOALS, search = undefined) =>
  goalOfPlacement(key, rules, search) !== undefined && g?.bossGoals?.done?.[key] !== true;

// Which kind a kill is (one of the data's counts names), or null when it never counts: a boss does not feed another boss's goal.
export function killTag(actor) {
  if (!actor || actor.bossProfile) return null;
  if (actor.markedHunter || actor.raidHunter || actor.relicHunter) return "hunter";
  if (actor.waveMob === true) return "wave";
  return typeof actor.placementKey === "string" ? "resident" : null;
}
export const countsFor = (row, actor) => {
  const tag = killTag(actor);
  return tag !== null && row.counts.includes(tag);
};

// True when the boss of `key` is already beaten in the saved run (so no goal is worth showing for it).
export function bossBeaten(g, key, area) {
  try {
    return (g.progressionModel?.deadPlacements(g.progression, area) ?? []).includes(key);
  } catch {
    return false; // an unreadable progression state: show the goal, the resident builder reports the real fault
  }
}

// The goal of the area the player stands in, as { row, key, done, progress, kills }, or null: goals off, no boss goal here, or the
// boss already beaten. `done` is true once the boss has been drawn out this session.
export function activeGoal(g, rules = BOSS_GOALS, search = undefined) {
  if (!bossGoalsEnabled(rules, search)) return null;
  const area = g?.world?.areaId,
    placements = g?.world?.bossData?.placements;
  if (!placements) return null;
  for (const place of placements) {
    if (place.areaId !== area) continue;
    const row = rules.goals.find((r) => r.placementKey === place.key);
    if (!row || bossBeaten(g, place.key, area)) continue;
    const state = g.bossGoals;
    return {
      row,
      key: place.key,
      done: state?.done?.[place.key] === true,
      progress: Math.min(row.kills, state?.progress?.[place.key] ?? 0),
      kills: row.kills,
    };
  }
  return null;
}
