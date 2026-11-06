// data/bossGoals.json (engine/boss-goal-core.js, engine/boss-goals.js): the boss unlock goals. The validator lives here so the loader
// (engine/game-data.js) stays small. Seconds and metres; `kills` is a count of qualifying kills. That each placementKey is a real boss
// placement and each goal has its two webText lines (bossGoal.<id>.hud and .arrive) is checked against the content by tests/boss-goals.test.js.
import { closed } from "./content-schema.js";
import { fail, count, number } from "./game-data-checks.js";

const NAME = /^[a-z][a-z0-9-]{0,23}$/;
const KEY = /^[a-z][a-z0-9-]{0,95}$/;
// The kinds of kill a goal may count (boss-goal-core.js killTag gives each kill exactly one, or none for a boss).
const tagNames = () => ["resident", "wave", "hunter"];

export function validateBossGoals(d) {
  closed(d, [
    "schema_version",
    "note",
    "note2",
    "enabled",
    "bossGoalsEnabledDefault",
    "startSwitch",
    "offSwitch",
    "summon",
    "flourish",
    "goals",
  ]);
  for (const f of ["enabled", "bossGoalsEnabledDefault"])
    if (typeof d[f] !== "boolean") fail("bossGoals", `${f} must be true or false`);
  for (const name of ["startSwitch", "offSwitch"]) {
    closed(d[name], ["param", "value"]);
    for (const k of ["param", "value"])
      if (typeof d[name][k] !== "string" || !/^[a-z0-9]{1,16}$/.test(d[name][k])) fail("bossGoals", `${name}.${k}`);
  }
  if (d.startSwitch.param === d.offSwitch.param) fail("bossGoals", "the start and off switches need different parameters");
  closed(d.summon, ["distance", "attempts"]);
  number("bossGoals", "summon.distance", d.summon.distance, 1);
  count("bossGoals", "summon.attempts", d.summon.attempts, 1, 64);
  closed(d.flourish, ["seconds", "messageSeconds"]);
  number("bossGoals", "flourish.seconds", d.flourish.seconds, 0.5);
  number("bossGoals", "flourish.messageSeconds", d.flourish.messageSeconds, 0.5);
  if (!Array.isArray(d.goals) || !d.goals.length || d.goals.length > 16)
    fail("bossGoals", "goals must list 1 to 16 rows");
  const ids = new Set(),
    keys = new Set();
  for (const row of d.goals) {
    closed(row, ["id", "placementKey", "kills", "counts"]);
    if (typeof row.id !== "string" || !NAME.test(row.id) || ids.has(row.id))
      fail("bossGoals", "goal ids must be unique lowercase names");
    ids.add(row.id);
    if (typeof row.placementKey !== "string" || !KEY.test(row.placementKey) || keys.has(row.placementKey))
      fail("bossGoals", `${row.id}.placementKey must be a unique placement key`);
    keys.add(row.placementKey);
    count("bossGoals", `${row.id}.kills`, row.kills, 1, 60);
    if (
      !Array.isArray(row.counts) ||
      !row.counts.length ||
      new Set(row.counts).size !== row.counts.length ||
      row.counts.some((tag) => !tagNames().includes(tag))
    )
      fail("bossGoals", `${row.id}.counts must list each kind of kill that counts once`);
  }
}
