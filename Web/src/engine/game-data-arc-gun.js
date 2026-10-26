// visual.json `arcGun`: how the Thundercoil Arc Gun's lightning looks (engine/arc-bolt-view.js). Two looks are kept side by side
// (`variants`), `variant` picks the one shown. Colours are 0xRRGGBB integers, times are seconds, lengths metres, opacities 0 to 1.
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

const checkColour = (field, v) => count("visual", field, v, 0, 0xffffff);
const lookFields = [
  "coreColour",
  "coreOpacity",
  "halos",
  "haloColour",
  "haloOpacity",
  "haloSpread",
  "jagSegments",
  "jitter",
  "boltSeconds",
  "flickerSeconds",
  "hopDelay",
  "sparkCount",
  "sparkSeconds",
  "sparkSpeed",
  "sparkSize",
  "sparkColour",
  "stunColour",
  "stunOpacity",
  "stunRadius",
  "stunSegments",
];
export function validateArcGun(d) {
  closed(d, ["variant", "maxLinks", "maxStuns", "variants"]);
  count("visual", "arcGun.maxLinks", d.maxLinks, 1, 8);
  count("visual", "arcGun.maxStuns", d.maxStuns, 1, 8);
  if (typeof d.variant !== "string" || !Object.hasOwn(d.variants, d.variant)) fail("visual", "arcGun.variant must name a variant");
  if (!Object.keys(d.variants).length || Object.keys(d.variants).length > 4) fail("visual", "arcGun.variants must hold 1 to 4 looks");
  for (const [name, look] of Object.entries(d.variants)) {
    const at = (f) => `arcGun.variants.${name}.${f}`;
    closed(look, lookFields);
    for (const f of ["coreColour", "haloColour", "sparkColour", "stunColour"]) checkColour(at(f), look[f]);
    for (const f of ["coreOpacity", "haloOpacity", "stunOpacity"]) {
      number("visual", at(f), look[f], 0);
      if (look[f] > 1) fail("visual", `${at(f)} must be at most 1`);
    }
    count("visual", at("halos"), look.halos, 0, 3);
    count("visual", at("jagSegments"), look.jagSegments, 2, 16);
    count("visual", at("sparkCount"), look.sparkCount, 0, 16);
    count("visual", at("stunSegments"), look.stunSegments, 3, 12);
    for (const f of ["haloSpread", "jitter", "sparkSpeed", "sparkSize", "stunRadius"]) number("visual", at(f), look[f], 0);
    for (const f of ["boltSeconds", "flickerSeconds", "hopDelay", "sparkSeconds"]) number("visual", at(f), look[f], 0.01);
    if (look.boltSeconds > 1 || look.hopDelay > 0.5) fail("visual", `${at("boltSeconds")} and hopDelay must stay short`);
  }
}
