// Validators for the three player-option files: uiScale.json (engine/ui-scale.js), colourBlind.json (engine/colour-blind.js) and
// heatDial.json (engine/heat-dial.js). Pixels are CSS pixels; colours are 6-digit lowercase hex (no #) in colourBlind.json and CSS
// colour strings in heatDial.json. Kept apart from the loader (engine/game-data.js) so that file stays small.
import { closed } from "./content-schema.js";
import { count, fail, id, number } from "./game-data-checks.js";

const HEX = /^[0-9a-f]{6}$/;
const CSS_COLOUR = /^(#[0-9a-f]{6}|rgba?\([0-9., ]{5,32}\))$/i;
const KEY = /^[a-z0-9.-]{3,40}$/;
const text = (v) => typeof v === "string" && v.trim().length > 0;
const flag = (file, name, v) => {
  if (typeof v !== "boolean") fail(file, `${name} must be true or false`);
};

function switchRow(file, row) {
  closed(row, ["param", "value"]);
  for (const k of ["param", "value"])
    if (typeof row[k] !== "string" || !/^[a-z0-9]{1,16}$/.test(row[k])) fail(file, `offSwitch.${k}`);
}

function validateFit(rows, orientation) {
  if (!Array.isArray(rows) || !rows.length) fail("uiScale", `fit.${orientation} must be rows`);
  for (const r of rows) {
    closed(r, ["axis", "fixedPx", "scalablePx"]);
    if (r.axis !== "width" && r.axis !== "height") fail("uiScale", `fit.${orientation}: axis must be width or height`);
    number("uiScale", `fit.${orientation}.fixedPx`, r.fixedPx, 0);
    number("uiScale", `fit.${orientation}.scalablePx`, r.scalablePx, 1);
  }
  for (const axis of ["width", "height"])
    if (!rows.some((r) => r.axis === axis)) fail("uiScale", `fit.${orientation} needs a ${axis} row`);
}

export function validateUiScale(d) {
  closed(d, [
    "schema_version",
    "enabled",
    "storageKey",
    "default",
    "cssVar",
    "bodyClass",
    "bounds",
    "roundTo",
    "steps",
    "fit",
    "text",
  ]);
  flag("uiScale", "enabled", d.enabled);
  if (!KEY.test(d.storageKey)) fail("uiScale", "storageKey must be a short lowercase key");
  if (typeof d.cssVar !== "string" || !/^--[a-z-]{3,32}$/.test(d.cssVar))
    fail("uiScale", "cssVar must look like --name");
  if (typeof d.bodyClass !== "string" || !/^[a-z-]{3,32}$/.test(d.bodyClass))
    fail("uiScale", "bodyClass must be a class name");
  closed(d.bounds, ["min", "max"]);
  if (!(d.bounds.min > 0 && d.bounds.min <= 1 && d.bounds.max >= 1 && d.bounds.max <= 2))
    fail("uiScale", "bounds: min in (0, 1], max in [1, 2]");
  count("uiScale", "roundTo", d.roundTo, 1, 1000);
  if (!Array.isArray(d.steps) || d.steps.length < 2 || d.steps.length > 6) fail("uiScale", "steps must be 2 to 6 rows");
  const seen = new Set();
  let last = 0;
  for (const s of d.steps) {
    closed(s, ["id", "scale"]);
    id("uiScale", "step id", s.id);
    if (seen.has(s.id)) fail("uiScale", "step ids must be unique");
    seen.add(s.id);
    if (!(Number.isFinite(s.scale) && s.scale > last)) fail("uiScale", `${s.id}: steps must ascend`);
    if (s.scale < d.bounds.min || s.scale > d.bounds.max) fail("uiScale", `${s.id}: scale is outside bounds`);
    last = s.scale;
  }
  const home = d.steps.find((s) => s.id === d.default);
  if (!home || home.scale !== 1) fail("uiScale", "default must be the step whose scale is exactly 1");
  closed(d.fit, ["portrait", "landscape"]);
  validateFit(d.fit.portrait, "portrait");
  validateFit(d.fit.landscape, "landscape");
  closed(d.text, ["label", "steps"]);
  if (!text(d.text.label)) fail("uiScale", "text.label must be text");
  closed(d.text.steps, [...seen]);
  for (const [k, v] of Object.entries(d.text.steps)) if (!text(v)) fail("uiScale", `text.steps.${k} must be text`);
}

function validateSlotValue(kind, slot, value) {
  if (kind === "hex") {
    if (typeof value !== "string" || !HEX.test(value)) fail("colourBlind", `${slot} must be 6 lowercase hex digits`);
  } else if (!Array.isArray(value) || value.length < 2 || !value.every((v) => typeof v === "string" && HEX.test(v)))
    fail("colourBlind", `${slot} must be a list of 2 or more hex colours`);
}

export function validateColourBlind(d) {
  closed(d, ["schema_version", "enabled", "storageKey", "default", "slots", "modes", "text"]);
  flag("colourBlind", "enabled", d.enabled);
  if (!KEY.test(d.storageKey)) fail("colourBlind", "storageKey must be a short lowercase key");
  if (!d.slots || typeof d.slots !== "object" || Array.isArray(d.slots) || !Object.keys(d.slots).length)
    fail("colourBlind", "slots must be an object");
  for (const [slot, kind] of Object.entries(d.slots)) {
    if (!/^[A-Za-z]+\.[A-Za-z0-9]+$/.test(slot)) fail("colourBlind", `${slot} is not a slot name like group.name`);
    if (kind !== "hex" && kind !== "list") fail("colourBlind", `${slot}: kind must be hex or list`);
  }
  if (!Array.isArray(d.modes) || d.modes.length < 2) fail("colourBlind", "modes must be rows");
  const ids = new Set();
  for (const m of d.modes) {
    closed(m, ["id", "slots"]);
    id("colourBlind", "mode id", m.id);
    if (ids.has(m.id)) fail("colourBlind", "mode ids must be unique");
    ids.add(m.id);
    if (!m.slots || typeof m.slots !== "object" || Array.isArray(m.slots))
      fail("colourBlind", `${m.id}: slots must be an object`);
    for (const [slot, value] of Object.entries(m.slots)) {
      if (!Object.hasOwn(d.slots, slot)) fail("colourBlind", `${m.id}: ${slot} is not a declared slot`);
      validateSlotValue(d.slots[slot], `${m.id}.${slot}`, value);
    }
  }
  if (d.modes[0].id !== "off" || Object.keys(d.modes[0].slots).length)
    fail("colourBlind", "the first mode must be off with no slots");
  if (d.default !== "off") fail("colourBlind", "default must be off");
  closed(d.text, ["label", "modes"]);
  if (!text(d.text.label)) fail("colourBlind", "text.label must be text");
  closed(d.text.modes, [...ids]);
  for (const [k, v] of Object.entries(d.text.modes)) if (!text(v)) fail("colourBlind", `text.modes.${k} must be text`);
}

export function validateHeatDial(d) {
  closed(d, [
    "schema_version",
    "enabled",
    "offSwitch",
    "widthPx",
    "barHeightPx",
    "tickWidthPx",
    "textPx",
    "gapPx",
    "topMarginPx",
    "percentOf",
    "pulse",
    "colours",
  ]);
  flag("heatDial", "enabled", d.enabled);
  switchRow("heatDial", d.offSwitch);
  count("heatDial", "widthPx", d.widthPx, 40, 400);
  count("heatDial", "barHeightPx", d.barHeightPx, 2, 24);
  count("heatDial", "tickWidthPx", d.tickWidthPx, 1, 4);
  count("heatDial", "textPx", d.textPx, 9, 24);
  count("heatDial", "gapPx", d.gapPx, 0, 24);
  count("heatDial", "topMarginPx", d.topMarginPx, 0, 48);
  if (d.percentOf !== 100) fail("heatDial", "percentOf must be 100");
  closed(d.pulse, ["seconds", "scale"]);
  if (!(d.pulse.seconds > 0 && d.pulse.seconds <= 3)) fail("heatDial", "pulse.seconds must be above 0 and at most 3");
  if (!(d.pulse.scale > 1 && d.pulse.scale <= 1.5)) fail("heatDial", "pulse.scale must be above 1 and at most 1.5");
  closed(d.colours, ["back", "tick", "text", "tiers"]);
  for (const k of ["back", "tick", "text"])
    if (typeof d.colours[k] !== "string" || !CSS_COLOUR.test(d.colours[k])) fail("heatDial", `colours.${k}`);
  if (!Array.isArray(d.colours.tiers) || !d.colours.tiers.length || d.colours.tiers.length > 9)
    fail("heatDial", "colours.tiers must be 1 to 9 colours");
  for (const c of d.colours.tiers)
    if (typeof c !== "string" || !CSS_COLOUR.test(c)) fail("heatDial", "colours.tiers must be CSS colours");
}
