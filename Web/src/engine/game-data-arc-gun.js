// visual.json `arcGun`: how the Thundercoil Arc Gun's lightning looks (engine/arc-bolt-view.js). Colours are 0xRRGGBB integers, times are
// seconds, lengths metres, widths CSS pixels on screen, opacities 0 to 1. `jitter` and `forkLength` are fractions of a hop's length.
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

const fields = [
  "maxLinks",
  "maxStuns",
  "coreColour",
  "coreOpacity",
  "coreWidth",
  "haloColour",
  "haloOpacity",
  "haloWidth",
  "jagSegments",
  "jitter",
  "forks",
  "forkLength",
  "forkSegments",
  "boltSeconds",
  "reJags",
  "hopDelay",
  "sparkCount",
  "sparkSeconds",
  "sparkSpeed",
  "sparkSize",
  "sparkColour",
  "stunColour",
  "stunOpacity",
  "stunCoreWidth",
  "stunHaloWidth",
  "stunRadius",
  "stunSegments",
  "stunFlickerSeconds",
];
export function validateArcGun(d) {
  closed(d, fields);
  const at = (f) => `arcGun.${f}`;
  count("visual", at("maxLinks"), d.maxLinks, 1, 8);
  count("visual", at("maxStuns"), d.maxStuns, 1, 8);
  for (const f of ["coreColour", "haloColour", "sparkColour", "stunColour"]) count("visual", at(f), d[f], 0, 0xffffff);
  for (const f of ["coreOpacity", "haloOpacity", "stunOpacity"]) {
    number("visual", at(f), d[f], 0);
    if (d[f] > 1) fail("visual", `${at(f)} must be at most 1`);
  }
  count("visual", at("jagSegments"), d.jagSegments, 2, 16);
  count("visual", at("forks"), d.forks, 0, 2);
  count("visual", at("forkSegments"), d.forkSegments, 1, 8);
  count("visual", at("reJags"), d.reJags, 0, 4);
  count("visual", at("sparkCount"), d.sparkCount, 0, 16);
  count("visual", at("stunSegments"), d.stunSegments, 3, 12);
  for (const f of ["coreWidth", "haloWidth", "stunCoreWidth", "stunHaloWidth"]) number("visual", at(f), d[f], 0.5);
  for (const f of ["jitter", "forkLength", "sparkSpeed", "sparkSize", "stunRadius"]) number("visual", at(f), d[f], 0);
  for (const f of ["boltSeconds", "hopDelay", "sparkSeconds", "stunFlickerSeconds"])
    number("visual", at(f), d[f], 0.01);
  if (d.boltSeconds > 1 || d.hopDelay > 0.5) fail("visual", `${at("boltSeconds")} and hopDelay must stay short`);
}
