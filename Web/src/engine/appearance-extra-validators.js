// Validators for the appearance.json tables that sit beside the survivor face mesh (faceField, faceWeathering, faceHair). They live here, not in
// game-data.js, so that file stays under the Web source density limit; game-data.js hands in its own fail/between/triple helpers.
import { closed } from "./content-schema.js";

export const appearanceExtraKeys = () => ["faceField", "faceWeathering", "faceHair"];

export function validateAppearanceExtras(d, tools) {
  validateFaceTables(d, tools);
}

// appearance.json `faceField`, `faceWeathering` and `faceHair` (face-appearance.js): the head blend band, the five weathering overlays and the
// hair ingredient numbers. Heights and offsets are metres on the repaired Hollow head (about 1.5 to 1.8 above the ground).
function validateFaceTables(d, { fail, between, triple }) {
  const row = (table, v, fields) => {
    closed(v, fields);
    for (const f of fields)
      if (!Array.isArray(v[f]) && typeof v[f] !== "string") between(`${table}.${f}`, v[f], -2, 2000);
  };
  row("faceField", d.faceField, ["from", "range", "pivot", "depth"]);
  if (d.faceField.range <= 0) fail("appearance", "faceField.range must be above 0");
  const w = d.faceWeathering;
  closed(w, ["noise", "frontZ", "stubble", "scar", "ash", "grime", "dust"]);
  triple("faceWeathering.noise", w.noise, 1000);
  between("faceWeathering.frontZ", w.frontZ, -1, 1);
  for (const name of ["stubble", "grime", "dust"]) {
    closed(
      w[name],
      name === "stubble"
        ? ["maxY", "base", "gain"]
        : name === "grime"
          ? ["noiseMin", "base", "gain"]
          : ["base", "gain"],
    );
    triple(`faceWeathering.${name}.base`, w[name].base, 2);
    triple(`faceWeathering.${name}.gain`, w[name].gain, 2);
  }
  between("faceWeathering.stubble.maxY", w.stubble.maxY, 0, 3);
  between("faceWeathering.grime.noiseMin", w.grime.noiseMin, 0, 1);
  row("faceWeathering.scar", w.scar, ["minX", "maxX", "baseY", "slope", "halfWidth", "color"]);
  triple("faceWeathering.scar.color", w.scar.color, 2);
  if (w.scar.minX >= w.scar.maxX) fail("appearance", "faceWeathering.scar minX must be below maxX");
  row("faceWeathering.ash", w.ash, ["minY", "noiseMin", "color"]);
  triple("faceWeathering.ash.color", w.ash.color, 2);
  const h = d.faceHair;
  closed(h, [
    "minY",
    "crestHalfWidth",
    "backCropMaxZ",
    "wave",
    "crest",
    "backCropRaise",
    "messy",
    "other",
    "underside",
    "material",
    "bodySkinDivisor",
  ]);
  row("faceHair.minY", h.minY, ["messy", "other"]);
  for (const f of ["crestHalfWidth", "backCropMaxZ", "backCropRaise", "bodySkinDivisor"])
    between(`faceHair.${f}`, h[f], 0.0001, 10);
  if (!Array.isArray(h.wave) || h.wave.length !== 2) fail("appearance", "faceHair.wave must list 2 numbers");
  h.wave.forEach((n, i) => between(`faceHair.wave[${i}]`, n, 0, 1000));
  row("faceHair.crest", h.crest, ["height", "floor", "span", "frequency", "taper", "halfWidth"]);
  if (h.crest.halfWidth <= 0) fail("appearance", "faceHair.crest.halfWidth must be above 0");
  row("faceHair.messy", h.messy, ["raise", "waveRaise", "scaleX", "scaleZ"]);
  row("faceHair.other", h.other, ["raise", "waveRaise", "scaleX", "scaleZ"]);
  row("faceHair.underside", h.underside, ["drop", "scale"]);
  closed(h.material, ["color", "roughness"]);
  if (typeof h.material.color !== "string" || !/^#[0-9a-f]{6}$/.test(h.material.color))
    fail("appearance", "faceHair.material.color must be #rrggbb");
  between("faceHair.material.roughness", h.material.roughness, 0, 1);
}
