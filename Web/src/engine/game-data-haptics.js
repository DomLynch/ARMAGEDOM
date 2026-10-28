// haptics.json (engine/haptics.js): phone vibration patterns per game event, the rate limit, strength levels and the menu text.
// The validator lives here so the loader (engine/game-data.js) stays under its size limit.
import { closed } from "./content-schema.js";
import { fail } from "./game-data-checks.js";

const text = (v) => typeof v === "string" && v.length > 0,
  isPattern = (p) =>
    Array.isArray(p) && p.length > 0 && p.length <= 12 && p.every((n) => Number.isInteger(n) && n > 0 && n <= 1000);

function validateRule(r, ids) {
  closed(r, ["id", "on", "actor", "priority", "pattern"], ["minAmount", "blocked", "finisher", "bypassGap"]);
  if (!text(r.id) || ids.has(r.id)) fail("haptics", "rule ids must be unique text");
  ids.add(r.id);
  if (!Array.isArray(r.on) || !r.on.length || !r.on.every(text)) fail("haptics", `${r.id}: on must be event names`);
  if (!["player", "enemy", "any"].includes(r.actor)) fail("haptics", `${r.id}: actor must be player, enemy or any`);
  if (!Number.isFinite(r.priority)) fail("haptics", `${r.id}: priority must be a number`);
  if (r.minAmount !== undefined && !(r.minAmount >= 0)) fail("haptics", `${r.id}: minAmount must be 0 or more`);
  for (const flag of ["blocked", "finisher", "bypassGap"])
    if (r[flag] !== undefined && typeof r[flag] !== "boolean") fail("haptics", `${r.id}: ${flag} must be true or false`);
  if (!isPattern(r.pattern)) fail("haptics", `${r.id}: pattern must be 1 to 12 millisecond values`);
}

export function validateHaptics(d) {
  closed(d, [
    "schema_version",
    "enabledDefault",
    "storageKey",
    "offParam",
    "minGapMs",
    "intensityDefault",
    "previewPattern",
    "intensityLevels",
    "lowHealth",
    "rules",
    "text",
  ]);
  if (typeof d.enabledDefault !== "boolean") fail("haptics", "enabledDefault must be true or false");
  if (!text(d.storageKey) || !text(d.offParam)) fail("haptics", "storageKey and offParam must be text");
  if (!Number.isFinite(d.minGapMs) || d.minGapMs < 0 || d.minGapMs > 2000) fail("haptics", "minGapMs must be 0 to 2000");
  if (!isPattern(d.previewPattern)) fail("haptics", "previewPattern must be 1 to 12 millisecond values");
  closed(d.text, ["on", "off", "intensityLabel", "levels"]);
  if (!text(d.text.on) || !text(d.text.off) || !text(d.text.intensityLabel)) fail("haptics", "text rows must be text");
  if (!Array.isArray(d.intensityLevels) || !d.intensityLevels.length) fail("haptics", "intensityLevels must be rows");
  for (const l of d.intensityLevels) {
    closed(l, ["id", "scale"]);
    if (!text(l.id) || !text(d.text.levels[l.id])) fail("haptics", "every intensity level needs an id and menu text");
    if (!(l.scale > 0 && l.scale <= 1)) fail("haptics", "intensity scale must be above 0 and at most 1");
  }
  if (!d.intensityLevels.some((l) => l.id === d.intensityDefault)) fail("haptics", "intensityDefault must be a level id");
  closed(d.lowHealth, ["enabled", "fraction", "intervalMs", "pattern"]);
  const low = d.lowHealth;
  if (typeof low.enabled !== "boolean" || !(low.fraction > 0 && low.fraction < 1))
    fail("haptics", "lowHealth enabled or fraction is invalid");
  if (!(low.intervalMs >= 300) || !isPattern(low.pattern)) fail("haptics", "lowHealth intervalMs or pattern is invalid");
  if (!Array.isArray(d.rules) || !d.rules.length) fail("haptics", "rules must be rows");
  const ids = new Set();
  for (const r of d.rules) validateRule(r, ids);
}
