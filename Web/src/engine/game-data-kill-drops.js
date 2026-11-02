// killDrops.json: coins an enemy leaves when it dies. Which tier an enemy belongs to, each tier's cash range and claim source, the coin
// models (cylinders only) and the toast text. engine/kill-drops.js runs it, engine/kill-drops-view.js draws it. `enabled` stays false
// until the server accepts the `kill:*` claim sources (see tests/kill-drops.test.js).
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

export function validateKillDrops(d) {
  const TIERS = ["trash", "creature", "boss"];
  closed(d, [
    "schema_version",
    "enabled",
    "pickupRadius",
    "despawnSeconds",
    "maxDrops",
    "noticeSeconds",
    "refusalRepeatSeconds",
    "displayScale",
    "cylinderSegments",
    "roughness",
    "metalness",
    "roll",
    "defaultTier",
    "rigTiers",
    "tiers",
    "text",
    "models",
    "look",
    "looks",
    "fxStyle",
    "classicSwitch",
  ]);
  closed(d.classicSwitch, ["param", "value"]);
  for (const k of ["param", "value"]) {
    if (typeof d.classicSwitch[k] !== "string" || !/^[a-z0-9]{1,24}$/.test(d.classicSwitch[k]))
      fail("killDrops", `classicSwitch.${k}`);
  }
  if (typeof d.enabled !== "boolean") fail("killDrops", "enabled must be true or false");
  number("killDrops", "pickupRadius", d.pickupRadius, 0.2);
  number("killDrops", "despawnSeconds", d.despawnSeconds, 1);
  count("killDrops", "maxDrops", d.maxDrops, 1, 64);
  number("killDrops", "noticeSeconds", d.noticeSeconds, 0.5);
  number("killDrops", "refusalRepeatSeconds", d.refusalRepeatSeconds, 0.5);
  number("killDrops", "displayScale", d.displayScale, 0.1);
  number("killDrops", "roughness", d.roughness, 0);
  number("killDrops", "metalness", d.metalness, 0);
  count("killDrops", "cylinderSegments", d.cylinderSegments, 3, 64);
  closed(d.roll, ["seed", "prime", "modulus"]);
  for (const k of ["seed", "prime", "modulus"]) count("killDrops", `roll.${k}`, d.roll[k], 1, 2 ** 32);
  if (!TIERS.includes(d.defaultTier)) fail("killDrops", "defaultTier");
  if (!d.rigTiers || typeof d.rigTiers !== "object" || Array.isArray(d.rigTiers)) fail("killDrops", "rigTiers");
  for (const [rig, tier] of Object.entries(d.rigTiers))
    if (!/^[a-z0-9-]{1,40}$/.test(rig) || !TIERS.includes(tier)) fail("killDrops", `rigTiers.${rig}`);
  closed(d.tiers, TIERS);
  closed(
    d.models,
    Object.values(d.tiers).map((t) => t.model),
  );
  let floor = 0;
  for (const tier of TIERS) {
    const row = d.tiers[tier];
    closed(row, ["min", "max", "source", "model"]);
    count("killDrops", `tiers.${tier}.min`, row.min, 1, 100000);
    count("killDrops", `tiers.${tier}.max`, row.max, row.min, 100000);
    if (row.min <= floor) fail("killDrops", "tier ranges must rise and not overlap");
    floor = row.max;
    if (row.source !== `kill:${tier}`) fail("killDrops", `tiers.${tier}.source must be kill:${tier}`);
    if (!Array.isArray(d.models[row.model])) fail("killDrops", `tiers.${tier}.model`);
  }
  closed(d.text, ["picked", "full"]);
  for (const [k, v] of Object.entries(d.text))
    if (typeof v !== "string" || !v.length || v.length > 60) fail("killDrops", `text.${k}`);
  if (!d.text.picked.includes("{amount}")) fail("killDrops", "text.picked needs {amount}");
  for (const [name, parts] of Object.entries(d.models)) checkModel(`models.${name}`, parts);
  checkLooks(d);
}
const hex = (file, v) => {
  if (typeof v !== "string" || !/^[0-9a-f]{6}$/.test(v)) fail("killDrops", `${file} must be a six-digit hex colour`);
};
// A model is 1 to 32 parts: a cylinder ([radius, height]) or a box ([x, y, z]), each placed, optionally turned (rot, radians), and coloured.
function checkModel(file, parts) {
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > 32)
    fail("killDrops", `${file} must list 1 to 32 parts`);
  for (const p of parts) {
    closed(p, ["shape", "size", "pos", "color"], ["rot"]);
    if (p.shape !== "cylinder" && p.shape !== "box") fail("killDrops", `${file} shape`);
    const sides = p.shape === "box" ? 3 : 2;
    if (!Array.isArray(p.size) || p.size.length !== sides || !p.size.every((n) => Number.isFinite(n) && n >= 0.001))
      fail("killDrops", `${file}.size`);
    if (!Array.isArray(p.pos) || p.pos.length !== 3 || !p.pos.every((n) => Number.isFinite(n) && Math.abs(n) <= 10))
      fail("killDrops", `${file}.pos`);
    if (p.rot !== undefined && (!Array.isArray(p.rot) || p.rot.length !== 3 || !p.rot.every(Number.isFinite)))
      fail("killDrops", `${file}.rot`);
    hex(`${file}.color`, p.color);
  }
}
const fxShapes = () => ({
  pool: { fields: ["radius", "colour", "opacity", "pulse", "hz"], optional: ["ringAt"] },
  beam: { fields: ["radius", "taper", "height", "colour", "opacity"], optional: [] },
  glint: { fields: ["count", "radius", "height", "size", "colour", "opacity", "hz", "sharpness"], optional: [] },
  burst: { fields: ["count", "period", "spread", "rise", "base", "size", "colour"], optional: [] },
  motion: { fields: ["spin", "bob", "bobHz", "lift"], optional: [] },
});
// `look` picks a row of `looks` (or "classic" for the plain models); `looks.<name>` gives per-tier models, an optional material and motion, and the
// light around each tier (pool, beam, glint, burst). `fxStyle` is the shared drawing of the glow textures and sprite counts.
function checkLooks(d) {
  closed(d.fxStyle, [
    "textureSize",
    "poolStops",
    "ringAlpha",
    "ringWidth",
    "starCore",
    "starArm",
    "starWidth",
    "beamStops",
    "beamSegments",
    "floorLift",
    "renderOrder",
    "heightLow",
    "minScale",
    "starAlpha",
    "hashA",
    "hashB",
    "hashC",
    "burstArc",
  ]);
  count("killDrops", "fxStyle.textureSize", d.fxStyle.textureSize, 16, 512);
  count("killDrops", "fxStyle.beamSegments", d.fxStyle.beamSegments, 3, 64);
  for (const k of ["poolStops", "beamStops"])
    if (
      !Array.isArray(d.fxStyle[k]) ||
      !d.fxStyle[k].length ||
      !d.fxStyle[k].every((s) => Array.isArray(s) && s.length === 2 && s.every(Number.isFinite))
    )
      fail("killDrops", `fxStyle.${k}`);
  for (const k of [
    "ringAlpha",
    "ringWidth",
    "starCore",
    "starArm",
    "starWidth",
    "floorLift",
    "renderOrder",
    "heightLow",
    "minScale",
    "starAlpha",
    "hashA",
    "hashB",
    "hashC",
    "burstArc",
  ])
    number("killDrops", `fxStyle.${k}`, d.fxStyle[k], 0);
  if (typeof d.look !== "string" || (d.look !== "classic" && !d.looks[d.look]))
    fail("killDrops", "look must be classic or a row of looks");
  for (const [name, look] of Object.entries(d.looks)) {
    if (!/^[A-Za-z][A-Za-z0-9-]{0,23}$/.test(name)) fail("killDrops", `looks.${name} id`);
    closed(look, ["models", "scale", "fx"], ["material", "motion"]);
    closed(look.models, Object.keys(d.models));
    for (const [m, parts] of Object.entries(look.models)) checkModel(`looks.${name}.models.${m}`, parts);
    number("killDrops", `looks.${name}.scale`, look.scale, 0.1);
    if (look.material) {
      closed(look.material, ["roughness", "metalness"], ["emissive", "emissiveIntensity"]);
      number("killDrops", `looks.${name}.material.roughness`, look.material.roughness, 0);
      number("killDrops", `looks.${name}.material.metalness`, look.material.metalness, 0);
      if (look.material.emissive !== undefined) hex(`looks.${name}.material.emissive`, look.material.emissive);
    }
    if (look.motion) {
      closed(look.motion, ["spin", "bob", "bobHz", "lift"]);
      for (const k of Object.keys(look.motion)) number("killDrops", `looks.${name}.motion.${k}`, look.motion[k], 0);
    }
    closed(look.fx, ["trash", "creature", "boss"]);
    for (const [tier, row] of Object.entries(look.fx)) checkFxRow(`looks.${name}.fx.${tier}`, row);
  }
}
// One drop's light: any of pool, beam, glint and burst, each with its own closed set of numbers and a hex colour.
export function checkFxRow(file, row) {
  const FX = fxShapes();
  closed(row, [], Object.keys(FX));
  for (const [kind, spec] of Object.entries(row)) {
    closed(spec, FX[kind].fields, FX[kind].optional);
    for (const [k, v] of Object.entries(spec)) {
      if (k === "colour") hex(`${file}.${kind}.colour`, v);
      else number("killDrops", `${file}.${kind}.${k}`, v, 0);
    }
  }
}
