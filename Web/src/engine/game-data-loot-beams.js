// lootBeams.json validator (engine/loot-beams.js and loot-beams-view.js read the data): the light column and ground ring where a rare drop fell.
// Seconds and metres. `styles` is keyed by a rarity name from loot.json; a rarity with no row (common) shows nothing. Colours are six hex digits.
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

const hex = (field, v) => {
  if (typeof v !== "string" || !/^[0-9a-f]{6}$/.test(v)) fail("lootBeams", `${field} must be six hex digits`);
};
const fraction = (field, v, min) => {
  number("lootBeams", field, v, min);
  if (v > 1) fail("lootBeams", `${field} is at most 1`);
};

export function validateLootBeams(d) {
  closed(d, [
    "schema_version",
    "enabled",
    "offSwitch",
    "maxBeams",
    "riseSeconds",
    "fadeSeconds",
    "ringGrowFrom",
    "pulse",
    "lift",
    "renderOrder",
    "heightSegments",
    "fadePower",
    "styles",
  ]);
  if (d.schema_version !== 1) fail("lootBeams", "schema_version must be 1");
  if (typeof d.enabled !== "boolean") fail("lootBeams", "enabled must be true or false");
  closed(d.offSwitch, ["param", "value"]);
  for (const k of ["param", "value"])
    if (typeof d.offSwitch[k] !== "string" || !/^[a-z0-9]{1,16}$/.test(d.offSwitch[k]))
      fail("lootBeams", `offSwitch.${k}`);
  count("lootBeams", "maxBeams", d.maxBeams, 1, 16);
  number("lootBeams", "riseSeconds", d.riseSeconds, 0);
  number("lootBeams", "fadeSeconds", d.fadeSeconds, 0);
  fraction("ringGrowFrom", d.ringGrowFrom, 0);
  closed(d.pulse, ["hz", "depth"]);
  number("lootBeams", "pulse.hz", d.pulse.hz, 0);
  fraction("pulse.depth", d.pulse.depth, 0);
  number("lootBeams", "lift", d.lift, 0);
  count("lootBeams", "renderOrder", d.renderOrder, 0, 100);
  count("lootBeams", "heightSegments", d.heightSegments, 1, 12);
  number("lootBeams", "fadePower", d.fadePower, 0.1);
  if (!d.styles || typeof d.styles !== "object" || !Object.keys(d.styles).length)
    fail("lootBeams", "styles must name at least one rarity");
  for (const [name, row] of Object.entries(d.styles)) {
    if (!/^[a-z]{3,16}$/.test(name)) fail("lootBeams", `style name ${name}`);
    closed(row, [
      "colour",
      "opacity",
      "seconds",
      "beamHeight",
      "beamRadius",
      "beamTaper",
      "beamSides",
      "ringSegments",
      "ringRadius",
      "rings",
    ]);
    hex(`${name}.colour`, row.colour);
    number("lootBeams", `${name}.opacity`, row.opacity, 0.01);
    if (row.opacity > 1) fail("lootBeams", `${name}.opacity is at most 1`);
    number("lootBeams", `${name}.seconds`, row.seconds, d.riseSeconds + d.fadeSeconds);
    number("lootBeams", `${name}.beamHeight`, row.beamHeight, 0);
    if (row.beamHeight > 30) fail("lootBeams", `${name}.beamHeight is at most 30`);
    number("lootBeams", `${name}.beamRadius`, row.beamRadius, 0.01);
    if (row.beamRadius > 2) fail("lootBeams", `${name}.beamRadius is at most 2`);
    fraction(`${name}.beamTaper`, row.beamTaper, 0);
    count("lootBeams", `${name}.beamSides`, row.beamSides, 3, 16);
    count("lootBeams", `${name}.ringSegments`, row.ringSegments, 3, 64);
    number("lootBeams", `${name}.ringRadius`, row.ringRadius, 0.1);
    if (row.ringRadius > 4) fail("lootBeams", `${name}.ringRadius is at most 4`);
    if (!Array.isArray(row.rings) || !row.rings.length || row.rings.length > 4)
      fail("lootBeams", `${name}.rings must list one to four bands`);
    for (const band of row.rings) {
      if (!Array.isArray(band) || band.length !== 2) fail("lootBeams", `${name}.rings bands are [inner, outer]`);
      fraction(`${name}.rings inner`, band[0], 0.01);
      fraction(`${name}.rings outer`, band[1], 0.01);
      if (band[0] >= band[1]) fail("lootBeams", `${name}.rings inner must be below outer`);
    }
  }
}
