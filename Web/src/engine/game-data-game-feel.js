// gameFeel.json (engine/game-feel.js): hit-stop, camera shake and the View zoom preset. The validator lives here so the loader
// (engine/game-data.js) stays under its size limit. Seconds, screen pixels per shake unit, a zoom multiplier that is 1 or closer.
import { closed } from "./content-schema.js";
import { fail, id, number } from "./game-data-checks.js";

const text = (v) => typeof v === "string" && v.length > 0;
const list = (v) => Array.isArray(v) && v.length > 0 && v.every(text);
function validateRule(r, ids, d) {
  const optional = [
    "flags",
    "attackerFlags",
    "excludeWeapons",
    "blocked",
    "minAmount",
    "overHpShare",
    "range",
    "cooldown",
    "hitStop",
    "shake",
  ];
  closed(r, ["id", "on", "victim"], optional);
  id("gameFeel", "rule id", r.id);
  if (ids.has(r.id)) fail("gameFeel", `${r.id}: rule ids must be unique`);
  ids.add(r.id);
  if (!list(r.on)) fail("gameFeel", `${r.id}: on must be event names`);
  if (!["player", "enemy", "any"].includes(r.victim)) fail("gameFeel", `${r.id}: victim must be player, enemy or any`);
  for (const k of ["flags", "attackerFlags", "excludeWeapons"])
    if (r[k] !== undefined && !list(r[k])) fail("gameFeel", `${r.id}: ${k}`);
  if (r.blocked !== undefined && typeof r.blocked !== "boolean")
    fail("gameFeel", `${r.id}: blocked must be true or false`);
  for (const k of ["minAmount", "range", "cooldown"])
    if (r[k] !== undefined) number("gameFeel", `${r.id}.${k}`, r[k], 0);
  if (r.overHpShare !== undefined && !(r.overHpShare > 0 && r.overHpShare < 1))
    fail("gameFeel", `${r.id}: overHpShare must be above 0 and below 1`);
  if (r.hitStop === undefined && r.shake === undefined) fail("gameFeel", `${r.id}: a rule needs a hitStop or a shake`);
  if (r.hitStop !== undefined && !(r.hitStop > 0 && r.hitStop <= d.hitStopCapSeconds))
    fail("gameFeel", `${r.id}: hitStop must be above 0 and at most hitStopCapSeconds`);
  if (r.shake !== undefined) {
    closed(r.shake, ["magnitude", "seconds"]);
    if (!(r.shake.magnitude > 0 && r.shake.magnitude <= d.maxShakeMagnitude))
      fail("gameFeel", `${r.id}: shake magnitude is out of range`);
    if (!(r.shake.seconds >= d.shakeSecondsRange[0] && r.shake.seconds <= d.shakeSecondsRange[1]))
      fail("gameFeel", `${r.id}: shake seconds is out of range`);
  }
}

export function validateGameFeel(d) {
  closed(d, [
    "schema_version",
    "modeScale",
    "hitStopCapSeconds",
    "maxShakeMagnitude",
    "shakeSecondsRange",
    "shake",
    "view",
    "text",
    "rules",
  ]);
  closed(d.modeScale, ["high", "low", "off"]);
  if (d.modeScale.off !== 0) fail("gameFeel", "modeScale.off must be 0");
  if (!(d.modeScale.low > 0 && d.modeScale.low <= d.modeScale.high && d.modeScale.high === 1))
    fail("gameFeel", "modeScale: off 0, low above 0, high 1");
  number("gameFeel", "hitStopCapSeconds", d.hitStopCapSeconds, 0.001);
  if (d.hitStopCapSeconds > 0.15) fail("gameFeel", "hitStopCapSeconds above 0.15 reads as a stall");
  number("gameFeel", "maxShakeMagnitude", d.maxShakeMagnitude, 0.001);
  if (
    !Array.isArray(d.shakeSecondsRange) ||
    d.shakeSecondsRange.length !== 2 ||
    !(d.shakeSecondsRange[0] > 0 && d.shakeSecondsRange[0] <= d.shakeSecondsRange[1])
  )
    fail("gameFeel", "shakeSecondsRange must be [min, max]");
  closed(d.shake, ["pixelsPerUnit", "frequencyX", "frequencyY"]);
  for (const k of Object.keys(d.shake)) number("gameFeel", `shake.${k}`, d.shake[k], 0.001);
  closed(d.view, ["default", "storageKey", "presets"]);
  if (!text(d.view.storageKey)) fail("gameFeel", "view.storageKey must be text");
  if (!Array.isArray(d.view.presets) || !d.view.presets.length) fail("gameFeel", "view.presets must be rows");
  closed(d.text, ["viewLabel", "presets"]);
  if (!text(d.text.viewLabel)) fail("gameFeel", "text.viewLabel must be text");
  const seen = new Set();
  for (const p of d.view.presets) {
    closed(p, ["id", "multiplier"]);
    id("gameFeel", "preset id", p.id);
    if (seen.has(p.id)) fail("gameFeel", "preset ids must be unique");
    seen.add(p.id);
    if (!(Number.isFinite(p.multiplier) && p.multiplier >= 1 && p.multiplier <= 2))
      fail("gameFeel", `${p.id}: multiplier must be 1 to 2`);
    if (!text(d.text.presets[p.id])) fail("gameFeel", `${p.id}: every preset needs menu text`);
  }
  if (!seen.has(d.view.default)) fail("gameFeel", "view.default must be a preset id");
  if (d.view.presets.find((p) => p.id === d.view.default).multiplier !== 1)
    fail("gameFeel", "the default preset must be multiplier 1");
  if (!Array.isArray(d.rules) || !d.rules.length) fail("gameFeel", "rules must be rows");
  const ids = new Set();
  for (const r of d.rules) validateRule(r, ids, d);
}
