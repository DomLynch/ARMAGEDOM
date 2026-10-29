// bossTaunts.json (engine/boss-taunts.js): the validator, called from game-data.js. Seconds, metres, shares 0 to 1.
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

const FILE = "bossTaunts";
export function validateBossTaunts(d) {
  closed(d, [
    "schema_version",
    "note",
    "flagParam",
    "offValue",
    "defaultOn",
    "maxChars",
    "spawnRange",
    "hurtShare",
    "minGapSeconds",
    "waitSeconds",
    "showSeconds",
    "kindPriority",
    "bosses",
  ]);
  if (typeof d.note !== "string" || !d.note || !d.flagParam || !d.offValue)
    fail(FILE, "note, flagParam and offValue are required");
  if (typeof d.defaultOn !== "boolean") fail(FILE, "defaultOn must be true or false");
  count(FILE, "maxChars", d.maxChars, 10, 120);
  number(FILE, "spawnRange", d.spawnRange, 1);
  if (!(d.hurtShare > 0 && d.hurtShare < 1)) fail(FILE, "hurtShare must be between 0 and 1");
  for (const k of ["minGapSeconds", "waitSeconds"]) number(FILE, k, d[k]);
  number(FILE, "showSeconds", d.showSeconds, 0.5);
  const kinds = Object.keys(d.kindPriority);
  closed(d.kindPriority, ["spawn", "aggro", "hurt", "death"]);
  for (const k of kinds) count(FILE, `kindPriority.${k}`, d.kindPriority[k], 1, 9);
  const bosses = Object.entries(d.bosses);
  if (!bosses.length) fail(FILE, "bosses must not be empty");
  for (const [name, rows] of bosses) {
    closed(rows, kinds);
    for (const kind of kinds) {
      const lines = rows[kind];
      if (!Array.isArray(lines) || !lines.length) fail(FILE, `${name}.${kind} needs at least one line`);
      for (const line of lines)
        if (typeof line !== "string" || !line.trim() || line.length > d.maxChars)
          fail(FILE, `${name}.${kind}: every line is text of at most ${d.maxChars} characters`);
    }
  }
}
