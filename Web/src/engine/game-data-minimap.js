// minimap.json validator (engine/minimap.js reads the data): the small corner map. Sizes are CSS pixels, distances metres, `hz` redraws
// per second; colours are CSS colour strings. `cycle` is the order a tap steps through the modes (every name must be a known mode).
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

const COLOUR = /^(#[0-9a-f]{6}|rgba?\([0-9., ]{5,32}\))$/i;
const PARAM = /^[a-z0-9]{1,16}$/;

const pair = (field, d, keys, min, max) => {
  closed(d, keys);
  for (const k of keys) count("minimap", `${field}.${k}`, d[k], min, max);
};

export function validateMinimap(d) {
  const MODES = ["small", "large", "hidden"], // every mode a tap can land on; the first two are drawn
    DRAWN = MODES.slice(0, 2);
  closed(d, [
    "schema_version",
    "enabled",
    "offSwitch",
    "storageKey",
    "defaultMode",
    "cycle",
    "hz",
    "maxDpr",
    "sizePx",
    "minSizePx",
    "chipPx",
    "topInsetPx",
    "menuOffsetPx",
    "controlBandPx",
    "radiusMetres",
    "rimPadPx",
    "maxDots",
    "dotPx",
    "lineWidthPx",
    "pinExitsToRim",
    "colours",
  ]);
  if (d.schema_version !== 1) fail("minimap", "schema_version must be 1");
  for (const k of ["enabled", "pinExitsToRim"])
    if (typeof d[k] !== "boolean") fail("minimap", `${k} must be true or false`);
  closed(d.offSwitch, ["param", "value"]);
  for (const k of ["param", "value"])
    if (typeof d.offSwitch[k] !== "string" || !PARAM.test(d.offSwitch[k])) fail("minimap", `offSwitch.${k}`);
  if (typeof d.storageKey !== "string" || !/^[A-Za-z0-9._-]{1,48}$/.test(d.storageKey))
    fail("minimap", "storageKey must be a short key");
  if (!MODES.includes(d.defaultMode)) fail("minimap", `defaultMode must be one of ${MODES.join(", ")}`);
  if (
    !Array.isArray(d.cycle) ||
    d.cycle.length < 2 ||
    d.cycle.some((m) => !MODES.includes(m)) ||
    new Set(d.cycle).size !== d.cycle.length
  )
    fail("minimap", "cycle must list two or more different modes");
  if (!d.cycle.includes(d.defaultMode)) fail("minimap", "cycle must include defaultMode");
  if (!DRAWN.every((m) => d.cycle.includes(m))) fail("minimap", "cycle must include small and large");
  count("minimap", "hz", d.hz, 1, 30);
  number("minimap", "maxDpr", d.maxDpr, 1);
  if (d.maxDpr > 4) fail("minimap", "maxDpr must be at most 4");
  count("minimap", "minSizePx", d.minSizePx, 24, 256);
  pair("sizePx", d.sizePx, DRAWN, d.minSizePx, 256);
  if (d.sizePx.large < d.sizePx.small) fail("minimap", "sizePx.large must not be below sizePx.small");
  count("minimap", "chipPx", d.chipPx, 24, 96);
  count("minimap", "topInsetPx", d.topInsetPx, 0, 96);
  count("minimap", "menuOffsetPx", d.menuOffsetPx, 0, 160);
  pair("controlBandPx", d.controlBandPx, ["portrait", "landscape"], 0, 1024);
  closed(d.radiusMetres, DRAWN);
  for (const k of DRAWN) number("minimap", `radiusMetres.${k}`, d.radiusMetres[k], 4);
  if (d.radiusMetres.large < d.radiusMetres.small)
    fail("minimap", "radiusMetres.large must not be below radiusMetres.small");
  number("minimap", "rimPadPx", d.rimPadPx, 0);
  if (d.rimPadPx * 2 >= d.minSizePx) fail("minimap", "rimPadPx must leave room inside the smallest map");
  closed(d.maxDots, ["hostile", "pickup", "boss"]);
  for (const k of ["hostile", "pickup", "boss"]) count("minimap", `maxDots.${k}`, d.maxDots[k], 1, 128);
  closed(d.dotPx, ["player", "hostile", "boss", "pickup", "exit", "objective"]);
  for (const [k, v] of Object.entries(d.dotPx)) number("minimap", `dotPx.${k}`, v, 0.5);
  if (d.dotPx.boss < d.dotPx.hostile) fail("minimap", "dotPx.boss must not be below dotPx.hostile");
  closed(d.lineWidthPx, ["border", "objectiveRing"]);
  for (const [k, v] of Object.entries(d.lineWidthPx)) number("minimap", `lineWidthPx.${k}`, v, 0.5);
  closed(d.colours, [
    "back",
    "walkable",
    "border",
    "player",
    "hostile",
    "boss",
    "pickup",
    "exit",
    "exitLocked",
    "objective",
    "chipBack",
    "chipBorder",
  ]);
  for (const [k, v] of Object.entries(d.colours))
    if (typeof v !== "string" || !COLOUR.test(v)) fail("minimap", `colours.${k} must be a hex or rgb colour`);
}
