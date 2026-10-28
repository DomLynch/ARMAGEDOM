// dailyLondon.json: the daily zone modifier (engine/daily-london.js draws it, engine/daily-london-view.js shows it). `neutral` lists every
// effect at its no-change value; a row's `effects` replaces some of them. Bounds keep every effect inside what the existing systems accept.
import { closed } from "./content-schema.js";
import { fail } from "./game-data-checks.js";

export function validateDailyLondon(d) {
  closed(d, ["schema_version", "enabled", "offSwitch", "seedKey", "messageSeconds", "excludedAreas", "note", "neutral", "text", "rows"]);
  closed(d.offSwitch, ["param", "value"]);
  for (const k of ["param", "value"])
    if (typeof d.offSwitch[k] !== "string" || !/^[a-z0-9]{1,16}$/.test(d.offSwitch[k])) fail("dailyLondon", `offSwitch.${k}`);
  if (typeof d.enabled !== "boolean" || typeof d.seedKey !== "string" || !d.seedKey) fail("dailyLondon", "enabled and seedKey");
  if (!Number.isFinite(d.messageSeconds) || d.messageSeconds < 1 || d.messageSeconds > 15) fail("dailyLondon", "messageSeconds is 1 to 15");
  if (!Array.isArray(d.excludedAreas) || !d.excludedAreas.every((a) => /^[a-z0-9-]{1,40}$/.test(a))) fail("dailyLondon", "excludedAreas");
  closed(d.text, ["badge", "announce"]);
  if (!d.text.badge.includes("{name}") || !d.text.announce.includes("{name}") || !d.text.announce.includes("{line}")) fail("dailyLondon", "text");
  const bounds = { sight: [0.25, 1], stashFloor: [0, 180], medkit: [1, 2] },
    nested = { light: { fill: [0.2, 1], key: [0.2, 1] }, hunt: { arrival: [0.5, 1], respawn: [0.5, 1], extra: [0, 2] } },
    inRange = (v, [lo, hi]) => Number.isFinite(v) && v >= lo && v <= hi;
  closed(d.neutral, Object.keys({ ...bounds, ...nested }));
  const check = (where, set) => {
    for (const [key, value] of Object.entries(set)) {
      if (nested[key]) {
        closed(value, Object.keys(nested[key]));
        for (const [k, range] of Object.entries(nested[key])) if (!inRange(value[k], range)) fail("dailyLondon", `${where}.${key}.${k}`);
      } else if (!bounds[key] || !inRange(value, bounds[key])) fail("dailyLondon", `${where}.${key}`);
    }
  };
  check("neutral", d.neutral);
  if (!Array.isArray(d.rows) || d.rows.length < 4 || d.rows.length > 6) fail("dailyLondon", "rows must list 4 to 6 modifiers");
  const ids = new Set();
  for (const row of d.rows) {
    closed(row, ["id", "name", "line", "look", "effects"]);
    if (!/^[a-z-]{1,24}$/.test(row.id) || ids.has(row.id)) fail("dailyLondon", "row ids are unique lowercase names");
    ids.add(row.id);
    if (typeof row.name !== "string" || !row.name || row.name.length > 24) fail("dailyLondon", `${row.id}.name`);
    if (typeof row.line !== "string" || !row.line || row.line.length > 90) fail("dailyLondon", `${row.id}.line`);
    if (!/^[a-z]{1,12}$/.test(row.look)) fail("dailyLondon", `${row.id}.look`);
    if (!Object.keys(row.effects).length) fail("dailyLondon", `${row.id} changes nothing`);
    check(row.id, row.effects);
  }
}
