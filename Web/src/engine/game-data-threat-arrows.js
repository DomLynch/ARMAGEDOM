// threatArrows.json validator (engine/threat-arrows.js reads the data): the edge-of-screen arrows that point at off-screen hunters.
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

const hex = (field, v) => {
  if (typeof v !== "string" || !/^[0-9a-f]{6}$/.test(v))
    fail("threatArrows", `${field} must be 6 lowercase hex digits`);
};
const opacity = (field, v) => {
  if (!(v > 0 && v <= 1)) fail("threatArrows", `${field} must be above 0 and at most 1`);
};
const look = (field, d) => {
  closed(d, ["sizePx", "colour", "opacity"]);
  number("threatArrows", `${field}.sizePx`, d.sizePx, 1);
  hex(`${field}.colour`, d.colour);
  opacity(`${field}.opacity`, d.opacity);
};

export function validateThreatArrows(d) {
  closed(d, [
    "schema_version",
    "enabled",
    "maxArrows",
    "sectorDegrees",
    "aggroMetres",
    "viewFraction",
    "distanceFade",
    "projectHeight",
    "fadeInMs",
    "insetPx",
    "touchBandPx",
    "outline",
    "clipPath",
    "plain",
    "marked",
  ]);
  if (typeof d.enabled !== "boolean") fail("threatArrows", "enabled must be true or false");
  count("threatArrows", "maxArrows", d.maxArrows, 1, 16);
  number("threatArrows", "sectorDegrees", d.sectorDegrees, 1);
  if (d.sectorDegrees > 360) fail("threatArrows", "sectorDegrees must be at most 360");
  number("threatArrows", "aggroMetres", d.aggroMetres, 0);
  if (!(d.viewFraction > 0 && d.viewFraction <= 1)) fail("threatArrows", "viewFraction must be above 0 and at most 1");
  closed(d.distanceFade, ["nearMetres", "farMetres", "minScale"]);
  number("threatArrows", "distanceFade.nearMetres", d.distanceFade.nearMetres, 0);
  if (!(d.distanceFade.farMetres > d.distanceFade.nearMetres))
    fail("threatArrows", "distanceFade.farMetres must be above nearMetres");
  opacity("distanceFade.minScale", d.distanceFade.minScale);
  number("threatArrows", "projectHeight", d.projectHeight, 0);
  number("threatArrows", "fadeInMs", d.fadeInMs, 0);
  number("threatArrows", "insetPx", d.insetPx, 0);
  closed(d.touchBandPx, ["portrait", "landscape"]);
  number("threatArrows", "touchBandPx.portrait", d.touchBandPx.portrait, 0);
  number("threatArrows", "touchBandPx.landscape", d.touchBandPx.landscape, 0);
  closed(d.outline, ["colour", "blurPx"]);
  hex("outline.colour", d.outline.colour);
  number("threatArrows", "outline.blurPx", d.outline.blurPx, 0);
  if (typeof d.clipPath !== "string" || !/^polygon\([0-9%., ]+\)$/.test(d.clipPath))
    fail("threatArrows", "clipPath must be a CSS polygon");
  look("plain", d.plain);
  look("marked", d.marked);
  if (d.marked.sizePx < d.plain.sizePx) fail("threatArrows", "marked.sizePx must not be below plain.sizePx");
}
