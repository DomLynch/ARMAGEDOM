// telegraph.json validator (engine/telegraph.js, telegraph-shape.js and telegraph-view.js read the data): the filled ground shape that
// fills up before an enemy attack lands. Metres and degrees unless a name says otherwise; opacities are above 0 and at most 1; colours
// are 6-digit lowercase hex strings (no leading #).
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

const HEX = /^[0-9a-f]{6}$/;
const opacity = (field, v) => {
  if (!(v > 0 && v <= 1)) fail("telegraph", `${field} must be above 0 and at most 1`);
};

export function validateTelegraph(d) {
  closed(d, [
    "schema_version",
    "enabled",
    "offSwitch",
    "maxVisible",
    "groundHeight",
    "renderOrder",
    "fullArcDegrees",
    "half",
    "layout",
    "turnSegments",
    "minArcSegments",
    "edgeMetres",
    "haloMetres",
    "miterLimit",
    "minGrowth",
    "fill",
    "edge",
    "haloOpacity",
    "colours",
    "pattern",
  ]);
  if (d.schema_version !== 1) fail("telegraph", "schema_version must be 1");
  if (typeof d.enabled !== "boolean") fail("telegraph", "enabled must be true or false");
  closed(d.offSwitch, ["param", "value"]);
  for (const k of ["param", "value"])
    if (typeof d.offSwitch[k] !== "string" || !/^[a-z0-9]{1,16}$/.test(d.offSwitch[k]))
      fail("telegraph", `offSwitch.${k}`);
  count("telegraph", "maxVisible", d.maxVisible, 1, 32);
  number("telegraph", "groundHeight", d.groundHeight, 0);
  if (d.groundHeight > 0.2) fail("telegraph", "groundHeight is at most 0.2");
  count("telegraph", "renderOrder", d.renderOrder, 0, 100);
  if (!(d.fullArcDegrees > 180 && d.fullArcDegrees <= 360))
    fail("telegraph", "fullArcDegrees must be above 180 and at most 360");
  if (d.half !== 0.5) fail("telegraph", "half must be 0.5");
  closed(d.layout, ["positionSize", "uvSize", "fanIndices", "stripIndices", "stripRings", "pixelBytes"]);
  for (const [name, size] of Object.entries({
    positionSize: 3,
    uvSize: 2,
    fanIndices: 3,
    stripIndices: 6,
    stripRings: 2,
    pixelBytes: 4,
  }))
    if (d.layout[name] !== size)
      fail("telegraph", `layout.${name} must be ${size}: it is the width of the buffer the code writes`);
  count("telegraph", "turnSegments", d.turnSegments, 8, 96);
  count("telegraph", "minArcSegments", d.minArcSegments, 1, d.turnSegments);
  number("telegraph", "edgeMetres", d.edgeMetres, 0.01);
  number("telegraph", "haloMetres", d.haloMetres, 0);
  if (d.edgeMetres > 0.5 || d.haloMetres > 0.5) fail("telegraph", "edgeMetres and haloMetres are at most 0.5");
  number("telegraph", "miterLimit", d.miterLimit, 1);
  number("telegraph", "minGrowth", d.minGrowth, 0);
  if (d.minGrowth >= 1) fail("telegraph", "minGrowth must be below 1");
  closed(d.fill, ["startOpacity", "endOpacity", "reducedOpacity"]);
  for (const k of ["startOpacity", "endOpacity", "reducedOpacity"]) opacity(`fill.${k}`, d.fill[k]);
  if (d.fill.endOpacity < d.fill.startOpacity) fail("telegraph", "fill.endOpacity must not be below fill.startOpacity");
  closed(d.edge, ["startOpacity", "endOpacity"]);
  for (const k of ["startOpacity", "endOpacity"]) opacity(`edge.${k}`, d.edge[k]);
  if (d.edge.endOpacity < d.edge.startOpacity) fail("telegraph", "edge.endOpacity must not be below edge.startOpacity");
  opacity("haloOpacity", d.haloOpacity);
  closed(d.colours, ["fill", "edge", "halo"]);
  for (const [name, value] of Object.entries(d.colours))
    if (typeof value !== "string" || !HEX.test(value))
      fail("telegraph", `colours.${name} must be 6 lowercase hex digits`);
  closed(d.pattern, ["cells", "solidShare", "gapOpacity", "periodMetres"]);
  count("telegraph", "pattern.cells", d.pattern.cells, 4, 64);
  if (!(d.pattern.solidShare > 0 && d.pattern.solidShare < 1))
    fail("telegraph", "pattern.solidShare must be above 0 and below 1");
  opacity("pattern.gapOpacity", d.pattern.gapOpacity);
  if (d.pattern.gapOpacity >= 1) fail("telegraph", "pattern.gapOpacity must be below 1 so the stripes show");
  number("telegraph", "pattern.periodMetres", d.pattern.periodMetres, 0.05);
}
