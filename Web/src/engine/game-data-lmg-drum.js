// lmgDrum.json validator: the Light Machine Gun's drum magazine (engine/lmg-drum.js), a cylinder and a band built from the rifle model.
import { closed } from "./content-schema.js";
import { count, number } from "./game-data-checks.js";

const checkColour = (field, v) => count("lmgDrum", field, v, 0, 0xffffff);
export function validateLmgDrum(d) {
  closed(d, ["schema_version", "drum", "band", "material"]);
  closed(d.drum, ["radius", "width", "segments", "y", "z"]);
  for (const f of ["radius", "width"]) number("lmgDrum", `drum.${f}`, d.drum[f], 0);
  for (const f of ["y", "z"]) number("lmgDrum", `drum.${f}`, d.drum[f], -Infinity);
  count("lmgDrum", "drum.segments", d.drum.segments, 3, 64);
  closed(d.band, ["radius", "width", "segments", "offset"]);
  for (const f of ["radius", "width"]) number("lmgDrum", `band.${f}`, d.band[f], 0);
  number("lmgDrum", "band.offset", d.band.offset, -Infinity);
  count("lmgDrum", "band.segments", d.band.segments, 3, 64);
  closed(d.material, ["color", "metalness", "roughness", "bandColor"]);
  checkColour("material.color", d.material.color);
  checkColour("material.bandColor", d.material.bandColor);
  for (const f of ["metalness", "roughness"]) number("lmgDrum", `material.${f}`, d.material[f], 0);
}
