// data/apocalypseRun.json (engine/apocalypse-run.js): the three-stage run. The validator lives here so the loader stays small.
import { closed } from "./content-schema.js";
import { fail, number, count } from "./game-data-checks.js";

const NAME = /^[a-z0-9-]{1,24}$/;
const checkText = (field, v) => {
  if (typeof v !== "string" || !v.trim() || v.length > 160) fail("apocalypseRun", `${field} must be a short line of text`);
};
const checkName = (field, v) => {
  if (typeof v !== "string" || !NAME.test(v)) fail("apocalypseRun", `${field} must be a lowercase id`);
};
const checkSwitch = (field, row) => {
  closed(row, ["param", "value"]);
  checkName(`${field}.param`, row.param);
  checkText(`${field}.value`, row.value);
};

function validateVariants(d) {
  closed(d.variants, ["scavenge", "assault", "hazard", "finale"]);
  for (const [kind, rows] of Object.entries(d.variants)) {
    if (!Array.isArray(rows) || !rows.length) fail("apocalypseRun", `variants.${kind} needs at least one row`);
    if (new Set(rows.map((r) => r.id)).size !== rows.length) fail("apocalypseRun", `variants.${kind} ids must be unique`);
    for (const row of rows) {
      checkName(`variants.${kind}.id`, row.id);
      if (kind === "scavenge") closed(row, ["id", "objective"]);
      if (kind === "assault") closed(row, ["id", "objective", "hunterCount", "durationSeconds"]);
      if (kind === "hazard") closed(row, ["id", "label", "heatScale"]);
      if (kind === "finale") closed(row, ["id", "kind", "objective"]);
      if (row.objective !== undefined) checkText(`variants.${kind}.objective`, row.objective);
      if (kind === "assault") {
        count("apocalypseRun", "assault.hunterCount", row.hunterCount, 1, 64);
        number("apocalypseRun", "assault.durationSeconds", row.durationSeconds, 1);
      }
      if (kind === "hazard") {
        checkText("hazard.label", row.label);
        number("apocalypseRun", "hazard.heatScale", row.heatScale, 0.1);
      }
      if (kind === "finale" && !["boss", "escape"].includes(row.kind)) fail("apocalypseRun", "finale.kind must be boss or escape");
    }
  }
  if (!d.variants.finale.some((r) => r.kind === "escape")) fail("apocalypseRun", "the finale needs an escape row (a boss may be absent)");
}

function validateStages(d) {
  if (!Array.isArray(d.stages) || d.stages.length < 2) fail("apocalypseRun", "stages needs at least two rows");
  if (new Set(d.stages.map((s) => s.id)).size !== d.stages.length) fail("apocalypseRun", "stage ids must be unique");
  for (const s of d.stages) {
    closed(s, ["id", "seconds", "banner", "bannerLine", "heatScale", "raids", "objectiveFrom"]);
    checkName("stage.id", s.id);
    number("apocalypseRun", "stage.seconds", s.seconds, 1);
    checkText("stage.banner", s.banner);
    checkText("stage.bannerLine", s.bannerLine);
    number("apocalypseRun", "stage.heatScale", s.heatScale, 0.1);
    if (!Object.hasOwn(d.variants, s.objectiveFrom)) fail("apocalypseRun", "stage.objectiveFrom must name a variants list");
    if (!Array.isArray(s.raids)) fail("apocalypseRun", "stage.raids must be a list");
    let last = -1;
    for (const r of s.raids) {
      closed(r, ["atSeconds"]);
      number("apocalypseRun", "raid.atSeconds", r.atSeconds, 0);
      if (r.atSeconds <= last || r.atSeconds >= s.seconds) fail("apocalypseRun", "raid triggers must rise and fall inside their stage");
      last = r.atSeconds;
    }
  }
  if (d.stages.at(-1).objectiveFrom !== "finale") fail("apocalypseRun", "the last stage is the finale");
}

const HEX = /^[0-9a-f]{6}$/;
function validateExtractionView(v) {
  closed(v, ["note", "ring", "hud"]);
  closed(v.ring, ["segments", "width", "colour", "opacity", "outsideShare"]);
  number("apocalypseRun", "extraction.view.ring.segments", v.ring.segments, 8);
  number("apocalypseRun", "extraction.view.ring.width", v.ring.width, 0.01);
  number("apocalypseRun", "extraction.view.ring.opacity", v.ring.opacity, 0.05);
  number("apocalypseRun", "extraction.view.ring.outsideShare", v.ring.outsideShare, 0.05);
  closed(v.hud, ["sizePx", "strokeUnits", "radiusUnits", "percentScale", "topPercent", "trackColour", "fillColour", "textPx"]);
  for (const f of ["sizePx", "strokeUnits", "radiusUnits", "topPercent", "textPx"]) number("apocalypseRun", `extraction.view.hud.${f}`, v.hud[f], 1);
  number("apocalypseRun", "extraction.view.hud.percentScale", v.hud.percentScale, 0.1);
  // The ring is drawn in a 100-unit box: the stroke must sit inside it.
  if (v.hud.radiusUnits + v.hud.radiusUnits + v.hud.strokeUnits > 100) fail("apocalypseRun", "extraction.view.hud ring and stroke must fit the 100-unit box");
  for (const [where, value] of [
    ["ring.colour", v.ring.colour],
    ["hud.trackColour", v.hud.trackColour],
    ["hud.fillColour", v.hud.fillColour],
  ])
    if (!HEX.test(value)) fail("apocalypseRun", `extraction.view.${where} must be six lowercase hex digits`);
}

function validateExtraction(x) {
  closed(x, [
    ...["note", "note2", "note3", "enabled", "offSwitch", "holdSeconds", "zoneDistance", "zoneTurns", "zoneClearRadius", "zoneExitClearance"],
    ...["holdRadius", "holdDecayPerSecond", "raidMinSeconds", "heatScale", "pull", "bonus", "view"],
  ]);
  validateExtractionView(x.view);
  if (typeof x.enabled !== "boolean") fail("apocalypseRun", "extraction.enabled must be a boolean");
  checkSwitch("extraction.offSwitch", x.offSwitch);
  for (const f of ["holdSeconds", "zoneDistance", "zoneClearRadius", "zoneExitClearance", "holdRadius", "heatScale"]) number("apocalypseRun", `extraction.${f}`, x[f], 0.1);
  number("apocalypseRun", "extraction.zoneTurns", x.zoneTurns, 2);
  number("apocalypseRun", "extraction.holdDecayPerSecond", x.holdDecayPerSecond, 0);
  number("apocalypseRun", "extraction.raidMinSeconds", x.raidMinSeconds, 0);
  closed(x.pull, ["engageRadius", "leashPadding", "arriveRadius"]);
  for (const f of ["engageRadius", "leashPadding", "arriveRadius"]) number("apocalypseRun", `extraction.pull.${f}`, x.pull[f], 0);
  closed(x.bonus, ["base", "curve"]);
  number("apocalypseRun", "extraction.bonus.base", x.bonus.base, 0);
  if (!Array.isArray(x.bonus.curve) || !x.bonus.curve.length) fail("apocalypseRun", "extraction.bonus.curve needs rows");
  x.bonus.curve.forEach((row, i) => {
    closed(row, ["minHeatPeak", "scale"]);
    number("apocalypseRun", "extraction.bonus.curve.minHeatPeak", row.minHeatPeak, 0);
    number("apocalypseRun", "extraction.bonus.curve.scale", row.scale, 0);
    if (i === 0 ? row.minHeatPeak !== 0 : row.minHeatPeak <= x.bonus.curve[i - 1].minHeatPeak)
      fail("apocalypseRun", "extraction.bonus.curve starts at heat peak 0 and rises");
  });
}

export function validateApocalypseRun(d) {
  closed(d, [
    "schema_version",
    "note",
    "enabled",
    "startSwitch",
    "offSwitch",
    "startZone",
    "seed",
    "bannerSeconds",
    "scaleValuables",
    "raidZones",
    "stages",
    "variants",
    "boss",
    "escape",
    "extraction",
    "outcomes",
    "text",
  ]);
  if (typeof d.enabled !== "boolean") fail("apocalypseRun", "enabled must be a boolean");
  checkSwitch("startSwitch", d.startSwitch);
  checkSwitch("offSwitch", d.offSwitch);
  if (d.startSwitch.param === d.offSwitch.param) fail("apocalypseRun", "the start and off switches need different parameters");
  checkName("startZone", d.startZone);
  closed(d.seed, ["fallbackDay", "separator", "salt"]);
  checkText("seed.fallbackDay", d.seed.fallbackDay);
  checkText("seed.salt", d.seed.salt);
  if (typeof d.seed.separator !== "string" || d.seed.separator.length !== 1) fail("apocalypseRun", "seed.separator must be one character");
  number("apocalypseRun", "bannerSeconds", d.bannerSeconds, 1);
  if (typeof d.scaleValuables !== "boolean") fail("apocalypseRun", "scaleValuables must be a boolean");
  if (!Array.isArray(d.raidZones) || !d.raidZones.length || d.raidZones.includes("westminster"))
    fail("apocalypseRun", "raidZones must list areas and never the tutorial");
  d.raidZones.forEach((z) => checkName("raidZones", z));
  validateVariants(d);
  validateStages(d);
  closed(d.boss, ["spawnDistance", "attempts", "arrived"]);
  number("apocalypseRun", "boss.spawnDistance", d.boss.spawnDistance, 1);
  count("apocalypseRun", "boss.attempts", d.boss.attempts, 1, 200);
  checkText("boss.arrived", d.boss.arrived);
  closed(d.escape, ["arrived"]);
  checkText("escape.arrived", d.escape.arrived);
  validateExtraction(d.extraction);
  closed(d.outcomes, ["escaped", "boss", "died", "timeout"]);
  for (const [k, v] of Object.entries(d.outcomes)) checkText(`outcomes.${k}`, v);
  closed(d.text, ["timer", "hazard", "startButton", "startHint", "resultsTitle", "rowOutcome", "rowKills", "rowTime", "rowHeat", "continue"]);
  for (const [k, v] of Object.entries(d.text)) checkText(`text.${k}`, v);
}
