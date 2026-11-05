// data/perks.json (engine/perks.js): the wave perks. The validator lives here so the loader (engine/game-data.js) stays small.
// The stat names are the ones the hooks in perks.js read; the row text is shown on the pick cards as written.
import { closed } from "./content-schema.js";
import { fail, count, number } from "./game-data-checks.js";

const NAME = /^[a-z][a-z0-9-]{0,23}$/;
// The stat names the hooks in perks.js read, and how an effect may combine (functions, not tables: the data is the table).
const statNames = () => [
  "damage",
  "moveSpeed",
  "shield",
  "staminaRegen",
  "magazine",
  "reload",
  "waveHeal",
  "dropChance",
];
const modeNames = () => ["mul", "add"];

const words = (field, v, max) => {
  if (typeof v !== "string" || !v.trim() || v.length > max) fail("perks", `${field} must be 1 to ${max} characters`);
};

export function validatePerks(d) {
  closed(d, [
    "schema_version",
    "note",
    "everyWaves",
    "choices",
    "autoPickSeconds",
    "messageSeconds",
    "seed",
    "stats",
    "perks",
  ]);
  count("perks", "everyWaves", d.everyWaves, 1, 100);
  count("perks", "choices", d.choices, 1, 3);
  number("perks", "autoPickSeconds", d.autoPickSeconds, 1);
  number("perks", "messageSeconds", d.messageSeconds, 0.1);
  closed(d.seed, ["fallbackDay", "separator", "salt", "dropSalt"]);
  for (const k of Object.keys(d.seed)) if (typeof d.seed[k] !== "string" || !d.seed[k]) fail("perks", `seed.${k}`);
  closed(d.stats, statNames());
  for (const stat of statNames()) {
    closed(d.stats[stat], ["mode"]);
    if (!modeNames().includes(d.stats[stat].mode)) fail("perks", `stats.${stat}.mode must be mul or add`);
  }
  if (!Array.isArray(d.perks) || d.perks.length < d.choices) fail("perks", "perks must list at least `choices` rows");
  const seen = new Set();
  for (const row of d.perks) {
    closed(row, ["id", "name", "text", "stat", "value", "maxStacks"]);
    if (typeof row.id !== "string" || !NAME.test(row.id) || seen.has(row.id))
      fail("perks", "perk ids must be unique lowercase names");
    seen.add(row.id);
    words(`${row.id}.name`, row.name, 24);
    words(`${row.id}.text`, row.text, 48);
    if (!statNames().includes(row.stat)) fail("perks", `${row.id}.stat must be one of the known stats`);
    number("perks", `${row.id}.value`, row.value, 0.01);
    count("perks", `${row.id}.maxStacks`, row.maxStacks, 1, 9);
    if (d.stats[row.stat].mode === "add" && row.stat === "magazine" && row.value > 1)
      fail("perks", `${row.id}.value is a fraction of the magazine`);
    if (d.stats[row.stat].mode === "mul" && row.value === 1) fail("perks", `${row.id}.value must change the stat`);
  }
}
