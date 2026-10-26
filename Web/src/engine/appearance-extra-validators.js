// Validators for the appearance.json tables beside the survivor face mesh (faceField, faceWeathering, faceHair) and the crookedHollow pose
// numbers. They live here, not in game-data.js, so that file stays under the Web source density limit; game-data.js hands in its own helpers.
import { closed } from "./content-schema.js";

export const appearanceExtraKeys = () => ["faceField", "faceWeathering", "faceHair", "animalCoat", "roachCoat"];

export function validateAppearanceExtras(d, tools) {
  validateFaceTables(d, tools);
  validateCrookedPose(d, tools);
  validateAnimalCoat(d, tools);
  validateRoachCoat(d, tools);
}

// visual.json clothing.minTonalGap: the least difference in relative luminance (0 to 1) a jacket and its trousers keep so both stay readable
// (clothing-palettes.js).
export function validateClothingGap(c, { fail }) {
  if (!Number.isFinite(c.minTonalGap) || c.minTonalGap < 0 || c.minTonalGap > 0.5)
    fail("visual", "clothing.minTonalGap must be from 0 to 0.5");
}

// roach-appearance.js: a band (`from`, `range`) maps a value to 0..1; the field rows are the frequencies of the wear noise.
function validateRoachCoat(d, { between }) {
  closed(d.roachCoat, ["taper", "field", "wear"]);
  for (const band of ["taper", "wear"]) {
    closed(d.roachCoat[band], ["from", "range"]);
    between(`roachCoat.${band}.from`, d.roachCoat[band].from, -10, 10);
    between(`roachCoat.${band}.range`, d.roachCoat[band].range, 0.001, 100);
  }
  closed(d.roachCoat.field, ["z", "cosX", "wobble", "y", "z2"]);
  for (const k of ["z", "cosX", "wobble", "y", "z2"]) between(`roachCoat.field.${k}`, d.roachCoat.field[k], 0, 1000);
}

// animal-appearance.js: a band (`from`, `range`) maps a value to 0..1; the field rows are the frequencies of the patch noise.
function validateAnimalCoat(d, { between }) {
  closed(d.animalCoat, ["taper", "field", "patch"]);
  for (const band of ["taper", "patch"]) {
    closed(d.animalCoat[band], ["from", "range"]);
    between(`animalCoat.${band}.from`, d.animalCoat[band].from, -10, 10);
    between(`animalCoat.${band}.range`, d.animalCoat[band].range, 0.001, 100);
  }
  closed(d.animalCoat.field, ["z", "cosY", "wobble", "x", "y"]);
  for (const k of ["z", "cosY", "wobble", "x", "y"]) between(`animalCoat.field.${k}`, d.animalCoat.field[k], 0, 1000);
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

// appearance.json `crookedHollow` (crooked-hollow.js): the fold, the gait curve and the pose offsets. The lean rows name bones in `bones`.
function validateCrookedPose(d, { fail, between }) {
  const c = d.crookedHollow;
  closed(c, [
    "bones",
    "lean",
    "gait",
    "reach",
    "pelvisDrop",
    "handDrop",
    "handForward",
    "elbowOut",
    "footHold",
    "cycleRate",
  ]);
  if (!Array.isArray(c.lean) || !c.lean.length || c.lean.length > 16)
    fail("appearance", "crookedHollow.lean must list 1 to 16 rows");
  for (const [i, row] of c.lean.entries()) {
    if (!Array.isArray(row) || row.length !== 4 || typeof row[0] !== "string" || !c.bones?.includes?.(row[0]))
      fail("appearance", `crookedHollow.lean[${i}] must be [bone in bones, x, y, z]`);
    for (const k of [1, 2, 3]) between(`crookedHollow.lean[${i}][${k}]`, row[k], -Math.PI, Math.PI);
  }
  // The gait curve maps a walk phase to the planted-foot phase: it runs from [0, 0] to [1, 1], rising in both columns.
  if (!Array.isArray(c.gait) || c.gait.length < 2 || c.gait.length > 16)
    fail("appearance", "crookedHollow.gait must list 2 to 16 keys");
  c.gait.forEach((key, i) => {
    if (!Array.isArray(key) || key.length !== 2) fail("appearance", `crookedHollow.gait[${i}] must be [phase, value]`);
    between(`crookedHollow.gait[${i}][0]`, key[0], 0, 1);
    between(`crookedHollow.gait[${i}][1]`, key[1], 0, 1);
    if (i && (key[0] <= c.gait[i - 1][0] || key[1] < c.gait[i - 1][1]))
      fail("appearance", `crookedHollow.gait[${i}] must rise`);
  });
  if (c.gait[0].join() !== "0,0" || c.gait.at(-1).join() !== "1,1")
    fail("appearance", "crookedHollow.gait must run from [0, 0] to [1, 1]");
  closed(c.reach, ["slack", "max"]);
  between("crookedHollow.reach.slack", c.reach.slack, 0, 0.1);
  between("crookedHollow.reach.max", c.reach.max, 0.5, 1);
  between("crookedHollow.pelvisDrop", c.pelvisDrop, 0, 0.5);
  between("crookedHollow.handDrop", c.handDrop, 0, 1.5);
  between("crookedHollow.handForward", c.handForward, -0.5, 0.5);
  between("crookedHollow.elbowOut", c.elbowOut, 0, 2);
  closed(c.footHold, ["l", "r"]);
  between("crookedHollow.footHold.l", c.footHold.l, 0, 1);
  between("crookedHollow.footHold.r", c.footHold.r, 0, 1);
  between("crookedHollow.cycleRate", c.cycleRate, 0.1, 10);
}

// creatures.json `mobSize` (mob-size-allocation.js, mob-size.js): the approved body-size factors and the range every factor must stay inside.
export function validateMobSize(m, { fail, number }) {
  closed(m, ["factors", "min", "max"]);
  number("creatures", "mobSize.min", m.min, 0.1);
  number("creatures", "mobSize.max", m.max, 0.1);
  if (m.min > 1 || m.max < 1 || m.max > 3) fail("creatures", "mobSize range must bracket 1 and stay at or below 3");
  if (
    !Array.isArray(m.factors) ||
    m.factors.length < 1 ||
    m.factors.length > 16 ||
    new Set(m.factors).size !== m.factors.length
  )
    fail("creatures", "mobSize.factors must list 1 to 16 different numbers");
  for (const f of m.factors)
    if (!Number.isFinite(f) || f < m.min || f > m.max)
      fail("creatures", `mobSize.factors ${f} is outside ${m.min} to ${m.max}`);
  if (m.factors.some((f, i) => i && f <= m.factors[i - 1])) fail("creatures", "mobSize.factors must rise");
}
