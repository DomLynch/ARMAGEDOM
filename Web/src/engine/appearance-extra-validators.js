// Validators for the appearance.json tables beside the survivor face mesh (faceField, faceWeathering, faceHair) and the crookedHollow pose
// numbers. They live here, not in game-data.js, so that file stays under the Web source density limit; game-data.js hands in its own helpers.
import { closed } from "./content-schema.js";

export const appearanceExtraKeys = () => [
  "faceField",
  "faceWeathering",
  "faceHair",
  "animalCoat",
  "roachCoat",
  "animalOffsets",
  "feralTorsoMask",
  "pickupGlow",
  "crownSplit",
  "finisherCosmetics",
  "severBloodEffect",
  "finisherOpened",
  "actorView",
  "finisherPresentation",
  "faceBuild",
  "faceRecipeCycle",
  "wolfNative",
];

export function validateAppearanceExtras(d, tools) {
  validateFaceTables(d, tools);
  validateCrookedPose(d, tools);
  validateAnimalCoat(d, tools);
  validateRoachCoat(d, tools);
  validateAnimalOffsets(d, tools);
  validateFeralAndGlow(d, tools);
  validateFinisherLooks(d, tools);
  validateFinisherOpened(d, tools);
  validateActorView(d, tools);
  validateFinisherPresentation(d, tools);
  validateFaceBuild(d, tools);
  validateRecipeCycle(d, tools);
}

// face-recipes.js: how far each recipe steps through the hair, skin and weathering lists, and how far the second head shifts them (the order is part of
// the library version). wolf-native.js: the share of a vertex's skin weight that must sit on the torso bones to bind a face to the body.
function validateRecipeCycle(d, { fail, between }) {
  closed(d.faceRecipeCycle, ["hairStride", "skinStride", "sideShift", "weatherSideShift"]);
  for (const k of ["hairStride", "skinStride", "sideShift", "weatherSideShift"]) {
    between(`faceRecipeCycle.${k}`, d.faceRecipeCycle[k], 0, 100);
    if (!Number.isInteger(d.faceRecipeCycle[k])) fail("appearance", `faceRecipeCycle.${k} must be a whole number`);
  }
  closed(d.wolfNative, ["bodyWeightMin"]);
  between("wolfNative.bodyWeightMin", d.wolfNative.bodyWeightMin, 0.01, 1);
}

// face-appearance.js: the build slice in milliseconds, how many steps pass between yields (powers of two, used as masks) and the weld precision.
function validateFaceBuild(d, { fail, between }) {
  const b = d.faceBuild;
  closed(b, ["sliceMs", "yieldEvery", "yieldEveryTriangles", "weldPrecision"]);
  between("faceBuild.sliceMs", b.sliceMs, 0.1, 1000);
  for (const k of ["yieldEvery", "yieldEveryTriangles"]) {
    between(`faceBuild.${k}`, b[k], 1, 65536);
    if (!Number.isInteger(b[k]) || (b[k] & (b[k] - 1)) !== 0)
      fail("appearance", `faceBuild.${k} must be a power of two`);
  }
  between("faceBuild.weldPrecision", b.weldPrecision, 10, 100000000);
}

// finisher-presentation.js: the victim pose emphasis, the bake clock, the neck stump and its cap, the head's throw and bounce, the hit shove and
// the moment the cut opens. Metres, seconds, shares and counts.
function validateFinisherPresentation(d, { fail, between }) {
  const p = d.finisherPresentation;
  closed(p, [
    "poseEmphasis",
    "clockMs",
    "clockEvery",
    "stumpBand",
    "stumpRadius",
    "cap",
    "headMaxVertices",
    "runThroughMax",
    "headThrow",
    "lastPhase",
    "hitShove",
    "shoveClearance",
    "cutStart",
    "crownOpenSeconds",
    "gravity",
    "maxSteps",
    "bounce",
    "spinMin",
  ]);
  closed(p.poseEmphasis, ["share", "window"]);
  between("finisherPresentation.poseEmphasis.share", p.poseEmphasis.share, 0, 1);
  between("finisherPresentation.poseEmphasis.window", p.poseEmphasis.window, 0, 10);
  closed(p.stumpRadius, ["min", "max"]);
  between("finisherPresentation.stumpRadius.min", p.stumpRadius.min, 0, 1);
  between("finisherPresentation.stumpRadius.max", p.stumpRadius.max, 0, 1);
  if (!(p.stumpRadius.max > p.stumpRadius.min)) fail("appearance", "finisherPresentation.stumpRadius must rise");
  closed(p.cap, ["thickness", "segments", "color", "triangles"]);
  between("finisherPresentation.cap.thickness", p.cap.thickness, 0.0001, 0.1);
  between("finisherPresentation.cap.segments", p.cap.segments, 3, 64);
  between("finisherPresentation.cap.triangles", p.cap.triangles, 0, 10000);
  hexColour(fail, "finisherPresentation.cap.color", p.cap.color);
  closed(p.headThrow, ["out", "up", "spin"]);
  for (const k of ["out", "up", "spin"]) between(`finisherPresentation.headThrow.${k}`, p.headThrow[k], 0, 100);
  closed(p.bounce, ["restitution", "friction", "spinDamp"]);
  for (const k of ["restitution", "friction", "spinDamp"])
    between(`finisherPresentation.bounce.${k}`, p.bounce[k], 0, 1);
  for (const [k, min, max] of [
    ["clockMs", 0.1, 1000],
    ["clockEvery", 1, 4096],
    ["stumpBand", 0, 1],
    ["headMaxVertices", 1000, 10000000],
    ["runThroughMax", 0, 60],
    ["lastPhase", 0.5, 1],
    ["hitShove", 0, 10],
    ["shoveClearance", 0, 10],
    ["cutStart", 0, 10],
    ["crownOpenSeconds", 0.001, 10],
    ["gravity", 0, 100],
    ["maxSteps", 1, 1000],
    ["spinMin", 0, 10],
  ])
    between(`finisherPresentation.${k}`, p[k], min, max);
  for (const [name, v] of [
    ["cap.segments", p.cap.segments],
    ["cap.triangles", p.cap.triangles],
    ["clockEvery", p.clockEvery],
    ["maxSteps", p.maxSteps],
    ["headMaxVertices", p.headMaxVertices],
  ])
    if (!Number.isInteger(v)) fail("appearance", `finisherPresentation.${name} must be a whole number`);
}

// actors.js: the damage flash colour and strength, the blob shadow, the marked-hunter tint, the drone clocks, the contact bands and the
// hit, flame and fire/reload timings. Plain numbers in metres, seconds and shares; the pairs are [low, high].
function validateActorView(d, { fail, between }) {
  const a = d.actorView;
  closed(a, [
    "damageColor",
    "shadowBlob",
    "shadowScale",
    "shadowLift",
    "markedTint",
    "roachBiteScales",
    "droneDeathSeconds",
    "droneWarningSeconds",
    "droneAttackLead",
    "droneAttackWindow",
    "defaultDeathSeconds",
    "huntArrivalShare",
    "rocketAimFallback",
    "rocketAimTargets",
    "finisherGeometryBudgetBytes",
    "footWeightMin",
    "toothVertex",
    "ratContact",
    "footBand",
    "calfBand",
    "hitFlashSeconds",
    "flashIntensity",
    "hitStepMax",
    "flameStepMax",
    "leanGain",
    "flinchGain",
    "fireWindowSeconds",
    "reloadClipSeconds",
  ]);
  hexColour(fail, "actorView.damageColor", a.damageColor);
  closed(a.shadowBlob, ["size", "centre", "innerRadius", "outerRadius", "midStop"]);
  for (const k of ["size", "centre", "innerRadius", "outerRadius"])
    between(`actorView.shadowBlob.${k}`, a.shadowBlob[k], 1, 1024);
  between("actorView.shadowBlob.midStop", a.shadowBlob.midStop, 0, 1);
  if (!(a.shadowBlob.outerRadius > a.shadowBlob.innerRadius))
    fail("appearance", "actorView.shadowBlob radii must grow");
  for (const [k, min, max] of [
    ["shadowScale", 0, 10],
    ["shadowLift", 0, 1],
    ["droneDeathSeconds", 0.01, 60],
    ["droneWarningSeconds", 0.01, 60],
    ["droneAttackLead", 0, 60],
    ["droneAttackWindow", 0, 60],
    ["defaultDeathSeconds", 0.01, 60],
    ["huntArrivalShare", 0, 1],
    ["rocketAimFallback", 0, 10],
    ["rocketAimTargets", 1, 1000],
    ["finisherGeometryBudgetBytes", 1048576, 4294967296],
    ["footWeightMin", 0, 1],
    ["toothVertex", 0, 1000000],
    ["hitFlashSeconds", 0, 10],
    ["flashIntensity", 0, 10],
    ["hitStepMax", 0.001, 1],
    ["flameStepMax", 0.001, 1],
    ["leanGain", 0, 10],
    ["flinchGain", 0, 10],
    ["fireWindowSeconds", 0, 10],
    ["reloadClipSeconds", 0.01, 60],
  ])
    between(`actorView.${k}`, a[k], min, max);
  for (const k of ["rocketAimTargets", "toothVertex", "finisherGeometryBudgetBytes"])
    if (!Number.isInteger(a[k])) fail("appearance", `actorView.${k} must be a whole number`);
  if (a.markedTint.length !== 3) fail("appearance", "actorView.markedTint must be [r, g, b]");
  a.markedTint.forEach((n, i) => between(`actorView.markedTint[${i}]`, n, 0, 1));
  if (!a.roachBiteScales.length) fail("appearance", "actorView.roachBiteScales must not be empty");
  a.roachBiteScales.forEach((n, i) => between(`actorView.roachBiteScales[${i}]`, n, 0, 100));
  for (const k of ["ratContact", "footBand", "calfBand"]) {
    if (a[k].length !== 2 || !(a[k][1] > a[k][0])) fail("appearance", `actorView.${k} must be [low, high] rising`);
    a[k].forEach((n, i) => between(`actorView.${k}[${i}]`, n, -10, 10));
  }
}

// finisher-opened.js: the bake's step budget (vertices, milliseconds, support reads), where the body is cut, the cap shading, the search and
// floor-table resolution, and the three pieces' fall (phase windows as progress fractions; slides as shares of the waist height).
function validateFinisherOpened(d, { fail, between }) {
  const o = d.finisherOpened;
  closed(o, [
    "chunkVertices",
    "stepMs",
    "clockEvery",
    "scanReads",
    "maxVertices",
    "poseAt",
    "scaleTolerance",
    "waistShare",
    "armShare",
    "cutColor",
    "cutRoughness",
    "capCentreShade",
    "capShade",
    "halfTurnSteps",
    "sweepSteps",
    "restTilt",
    "floorSteps",
    "floorLift",
    "envelopeMargin",
    "phases",
    "slides",
  ]);
  for (const [k, min, max] of [
    ["chunkVertices", 16, 1000000],
    ["stepMs", 0.1, 1000],
    ["clockEvery", 1, 4096],
    ["scanReads", 1000, 100000000],
    ["maxVertices", 1000, 10000000],
    ["floorSteps", 2, 10000],
    ["halfTurnSteps", 2, 1000],
    ["sweepSteps", 2, 10000],
  ]) {
    between(`finisherOpened.${k}`, o[k], min, max);
    if (!Number.isInteger(o[k])) fail("appearance", `finisherOpened.${k} must be a whole number`);
  }
  for (const k of ["poseAt", "waistShare", "armShare", "cutRoughness", "capCentreShade"])
    between(`finisherOpened.${k}`, o[k], 0, 1);
  for (const k of ["scaleTolerance", "restTilt", "floorLift", "envelopeMargin"])
    between(`finisherOpened.${k}`, o[k], 0, 1);
  hexColour(fail, "finisherOpened.cutColor", o.cutColor);
  closed(o.capShade, ["base", "swing", "waveX", "waveZ"]);
  for (const k of ["base", "swing"]) between(`finisherOpened.capShade.${k}`, o.capShade[k], 0, 1);
  for (const k of ["waveX", "waveZ"]) between(`finisherOpened.capShade.${k}`, o.capShade[k], 0, 1000);
  closed(o.phases, ["slide", "fall", "legs", "drop"]);
  for (const [name, [from, to]] of Object.entries(o.phases)) {
    between(`finisherOpened.phases.${name}`, from, 0, 1);
    between(`finisherOpened.phases.${name}`, to, 0, 1);
    if (!(to > from)) fail("appearance", `finisherOpened.phases.${name} must end after it starts`);
  }
  closed(o.slides, ["upper", "lower", "weapon"]);
  for (const [name, [x, z]] of Object.entries(o.slides)) {
    between(`finisherOpened.slides.${name}.x`, x, -2, 2);
    between(`finisherOpened.slides.${name}.z`, z, -2, 2);
  }
}

const hexColour = (fail, field, v) => {
  if (typeof v !== "string" || !/^#[0-9a-f]{6}$/.test(v)) fail("appearance", `${field} must be #rrggbb`);
};
// finisher-crown.js: the vertex budget, the cut colour and how far the halves open (radians, metres). finisher-cosmetics.js: the corpse
// glow pulse (base share and swing) and how much of the pulse tints the colour. sever-blood-effect.js: the jet cone, the pool disc, the
// blood colour and the pool's lift off the ground.
function validateFinisherLooks(d, { fail, between }) {
  closed(d.crownSplit, ["maxVertices", "cutColor", "openRadians", "openMetres", "sliceMs", "weldPrecision"]);
  between("crownSplit.maxVertices", d.crownSplit.maxVertices, 1000, 1000000);
  between("crownSplit.sliceMs", d.crownSplit.sliceMs, 0.1, 1000);
  between("crownSplit.weldPrecision", d.crownSplit.weldPrecision, 10, 100000000);
  hexColour(fail, "crownSplit.cutColor", d.crownSplit.cutColor);
  between("crownSplit.openRadians", d.crownSplit.openRadians, 0, 1);
  between("crownSplit.openMetres", d.crownSplit.openMetres, 0, 0.1);
  closed(d.finisherCosmetics, ["pulseBase", "pulseSwing", "hotMix"]);
  for (const k of ["pulseBase", "pulseSwing", "hotMix"])
    between(`finisherCosmetics.${k}`, d.finisherCosmetics[k], 0, 1);
  closed(d.severBloodEffect, ["jetTopRadius", "jetSegments", "poolSegments", "color", "groundLift"]);
  between("severBloodEffect.jetTopRadius", d.severBloodEffect.jetTopRadius, 0, 10);
  for (const k of ["jetSegments", "poolSegments"]) {
    between(`severBloodEffect.${k}`, d.severBloodEffect[k], 3, 64);
    if (!Number.isInteger(d.severBloodEffect[k])) fail("appearance", `severBloodEffect.${k} must be a whole number`);
  }
  hexColour(fail, "severBloodEffect.color", d.severBloodEffect.color);
  between("severBloodEffect.groundLift", d.severBloodEffect.groundLift, 0, 0.1);
}

// animal-cycle.js: per cycle (A, B) the roamers whose body sits off its placement point, as x and z offsets in metres.
function validateAnimalOffsets(d, { fail, between }) {
  closed(d.animalOffsets, ["A", "B"]);
  for (const [cycle, rows] of Object.entries(d.animalOffsets))
    for (const [key, offset] of Object.entries(rows)) {
      if (!/^[a-z]+-roamer-\d+$/.test(key)) fail("appearance", `animalOffsets.${cycle} has an invalid placement key`);
      closed(offset, ["x", "z"]);
      between(`animalOffsets.${cycle}.${key}.x`, offset.x, -1, 1);
      between(`animalOffsets.${cycle}.${key}.z`, offset.z, -1, 1);
    }
}

// feral-body-shapes.js: the torso taper band (`from`, `range`) maps a skin weight to 0..1. pickup-glow.js: the contour stroke width in
// pixels, its colour (#rrggbb) and how far its render order sits above the pickup's own.
function validateFeralAndGlow(d, { fail, between }) {
  closed(d.feralTorsoMask, ["from", "range"]);
  between("feralTorsoMask.from", d.feralTorsoMask.from, -10, 10);
  between("feralTorsoMask.range", d.feralTorsoMask.range, 0.001, 100);
  closed(d.pickupGlow, ["stroke", "color", "orderOffset"]);
  between("pickupGlow.stroke", d.pickupGlow.stroke, 0.1, 20);
  between("pickupGlow.orderOffset", d.pickupGlow.orderOffset, 0.0001, 1);
  if (typeof d.pickupGlow.color !== "string" || !/^#[0-9a-f]{6}$/.test(d.pickupGlow.color))
    fail("appearance", "pickupGlow.color must be #rrggbb");
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

// The top-level keys of creatures.json. (The list lives here, not in game-data.js, to keep that file under the density limit.)
export const creatureKeys = () => [
  "schema_version",
  "moves",
  "playerAttacks",
  "playerHealth",
  "defaultResponse",
  "salamanderBreath",
  "drone",
  "catalogue",
  "behaviours",
  "animalCycles",
  "gauntHumanCycles",
  "hollowTuning",
  "creatureSim",
  "mobSize",
  "feralBodyShapes",
  "feralCoatProfiles",
  "gauntShape",
  "rigCapabilities",
  "bridgeSteering",
  "droneLaser",
];

// creatures.json bridgeSteering (bridge-steering.js) and droneLaser (drone-laser.js): metres, seconds and a leash radius.
export function validateCreatureExtras(d, { fail, number }) {
  closed(d.bridgeSteering, ["edgeMargin", "leash", "progressStep", "stallSeconds", "waypointReach"]);
  for (const [name, min, max] of [
    ["edgeMargin", 0, 1],
    ["leash", 0.1, 1000],
    ["progressStep", 0.001, 5],
    ["stallSeconds", 0.05, 60],
    ["waypointReach", 0.01, 5],
  ]) {
    number("creatures", `bridgeSteering.${name}`, d.bridgeSteering[name], min);
    if (d.bridgeSteering[name] > max) fail("creatures", `bridgeSteering.${name} above ${max}`);
  }
  closed(d.droneLaser, ["trailMetres", "width"]);
  for (const name of ["trailMetres", "width"]) {
    number("creatures", `droneLaser.${name}`, d.droneLaser[name], 0.001);
    if (d.droneLaser[name] > 10) fail("creatures", `droneLaser.${name} above 10`);
  }
}
