// data/runSummary.json (engine/run-summary.js): the death-screen run summary's storage key and stat rows. The validator lives here so the
// loader (engine/game-data.js) stays small. Text for the rows is in webText.json (summary.*), keyed by the row id.
import { closed } from "./content-schema.js";
import { fail, count } from "./game-data-checks.js";

const NAME = /^[a-z][a-z0-9-]{0,23}$/;
const formats = () => ["time", "count"];
const needs = () => ["always", "waves", "heat"];
const sources = () => ["time", "kills", "cleared", "wave", "score", "heat"];

export function validateRunSummary(d) {
  closed(d, ["schema_version", "note", "storage", "timeDigits", "stats"]);
  closed(d.storage, ["key", "version"]);
  if (typeof d.storage.key !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{2,63}$/.test(d.storage.key))
    fail("runSummary", "storage.key");
  count("runSummary", "storage.version", d.storage.version, 1, 1000);
  count("runSummary", "timeDigits", d.timeDigits, 1, 4);
  if (!Array.isArray(d.stats) || !d.stats.length || d.stats.length > 12)
    fail("runSummary", "stats must list 1 to 12 rows");
  const seen = new Set();
  for (const row of d.stats) {
    closed(row, ["id", "source", "format", "needs"]);
    if (typeof row.id !== "string" || !NAME.test(row.id) || seen.has(row.id))
      fail("runSummary", "stat ids must be unique lowercase names");
    seen.add(row.id);
    if (!sources().includes(row.source)) fail("runSummary", `${row.id}.source`);
    if (!formats().includes(row.format)) fail("runSummary", `${row.id}.format`);
    if (!needs().includes(row.needs)) fail("runSummary", `${row.id}.needs`);
  }
}
