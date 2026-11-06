// data/dailyContract.json (engine/daily-contract.js): the daily contract's storage key, seed, weapon ids and goal pool. The validator lives
// here so the loader (engine/game-data.js) stays small. Text for the goals is in webText.json (daily.*), keyed by source and weapon.
import { closed } from "./content-schema.js";
import { fail, count, number } from "./game-data-checks.js";

const NAME = /^[a-z][a-z0-9-]{0,23}$/;
const sources = () => ["hollows", "time", "cleared", "elite", "calm", "weapon"];
const modes = () => ["total", "best"];
const needs = () => ["always", "waves"];
const tiers = () => ["easy", "medium", "hard"];
const text = (field, v) => {
  if (typeof v !== "string" || !v.trim()) fail("dailyContract", `${field} must be a non-empty string`);
};

export function validateDailyContract(d) {
  closed(d, [
    "schema_version",
    "note",
    "storage",
    "seed",
    "tiers",
    "dayCheckSeconds",
    "messageSeconds",
    "hollowRig",
    "weapons",
    "goals",
  ]);
  closed(d.storage, ["key", "version"]);
  if (typeof d.storage.key !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{2,63}$/.test(d.storage.key))
    fail("dailyContract", "storage.key");
  count("dailyContract", "storage.version", d.storage.version, 1, 1000);
  closed(d.seed, ["salt", "separator"]);
  text("seed.salt", d.seed.salt);
  text("seed.separator", d.seed.separator);
  if (JSON.stringify(d.tiers) !== JSON.stringify(tiers())) fail("dailyContract", "tiers must be easy, medium, hard");
  number("dailyContract", "dayCheckSeconds", d.dayCheckSeconds, 1);
  number("dailyContract", "messageSeconds", d.messageSeconds, 0.5);
  text("hollowRig", d.hollowRig);
  if (!d.weapons || typeof d.weapons !== "object" || Array.isArray(d.weapons)) fail("dailyContract", "weapons");
  for (const [name, weaponId] of Object.entries(d.weapons)) {
    if (!NAME.test(name)) fail("dailyContract", `weapons.${name} must be a lowercase name`);
    text(`weapons.${name}`, weaponId);
  }
  if (!Array.isArray(d.goals) || !d.goals.length || d.goals.length > 64)
    fail("dailyContract", "goals must list 1 to 64 rows");
  const seen = new Set(),
    open = Object.fromEntries(tiers().map((tier) => [tier, new Set()]));
  for (const row of d.goals) {
    const base = ["id", "tier", "source", "target", "mode", "needs"];
    closed(row, row.source === "weapon" ? [...base, "weapon"] : base);
    if (typeof row.id !== "string" || !NAME.test(row.id) || seen.has(row.id))
      fail("dailyContract", "goal ids must be unique lowercase names");
    seen.add(row.id);
    if (!tiers().includes(row.tier)) fail("dailyContract", `${row.id}.tier`);
    if (!sources().includes(row.source)) fail("dailyContract", `${row.id}.source`);
    if (row.source === "weapon" && !(row.weapon in d.weapons))
      fail("dailyContract", `${row.id}.weapon must be a key of weapons`);
    count("dailyContract", `${row.id}.target`, row.target, 1, 100000);
    if (!modes().includes(row.mode)) fail("dailyContract", `${row.id}.mode`);
    if (!needs().includes(row.needs)) fail("dailyContract", `${row.id}.needs`);
    if (row.needs === "always") open[row.tier].add(row.source);
  }
  // A draw takes each source once, so after two sources are used every tier must still have a third to pick, with the waves off.
  for (const tier of tiers())
    if (open[tier].size < tiers().length)
      fail("dailyContract", `${tier} needs goals from three sources that are always on`);
}
