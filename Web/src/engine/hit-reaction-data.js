// hitReaction.json (engine/hit-reaction.js): alive hit reactions of bosses and marked hunters, ?hitreact=0 off. Closed schema, checked at load.
import { closed } from "./content-schema.js";
import { fail, number } from "./game-data-checks.js";

const F = "hitReaction";

export function validateHitReaction(d) {
  // The names the runtime understands (kept inside the validator: the data-layer gate allows no top-level tables).
  const PARTS = ["hips", "spine", "spine1", "spine2", "neck", "head", "armNear", "forearmNear", "thighLeft", "thighRight", "shinLeft", "shinRight"],
    ZONES = ["head", "torso", "arms", "legs"];
  closed(d, [
    "schema_version", "note", "flagParam", "offValue", "defaultOn", "eligibleFlags", "maxActive", "retriggerSeconds",
    "minDirectionLength", "fallbackDirection", "bendRadians", "twistRadians", "damage", "hash", "weaponClass", "classes", "zones", "order",
  ]);
  if (typeof d.note !== "string" || !d.note) fail(F, "note must say the values are placeholders");
  if (typeof d.flagParam !== "string" || typeof d.offValue !== "string") fail(F, "flagParam and offValue must be strings");
  if (typeof d.defaultOn !== "boolean") fail(F, "defaultOn must be true or false");
  if (!Array.isArray(d.eligibleFlags) || !d.eligibleFlags.length || !d.eligibleFlags.every((x) => typeof x === "string" && x))
    fail(F, "eligibleFlags must name at least one entity field");
  for (const name of ["maxActive", "retriggerSeconds", "bendRadians", "twistRadians"]) number(F, name, d[name], 0.01);
  number(F, "minDirectionLength", d.minDirectionLength, 0);
  closed(d.fallbackDirection, ["x", "z"]);
  if (!(Number.isFinite(d.fallbackDirection.x) && Number.isFinite(d.fallbackDirection.z) && Math.hypot(d.fallbackDirection.x, d.fallbackDirection.z) > 0))
    fail(F, "fallbackDirection must be a finite, non-zero direction");
  closed(d.damage, ["ref", "min", "max"]);
  number(F, "damage.ref", d.damage.ref, 0.01);
  if (!(d.damage.min > 0 && d.damage.min <= d.damage.max)) fail(F, "damage.min must be above 0 and at most damage.max");
  closed(d.hash, ["mul", "mod"]);
  number(F, "hash.mul", d.hash.mul, 1);
  number(F, "hash.mod", d.hash.mod, 1);
  if (!Array.isArray(d.order) || !d.order.every((p) => PARTS.includes(p))) fail(F, "order must list only known parts");
  const classes = Object.keys(d.classes);
  if (!classes.length) fail(F, "classes must hold at least one weapon class");
  for (const [weapon, cls] of Object.entries(d.weaponClass))
    if (!classes.includes(cls)) fail(F, `weaponClass.${weapon} names an unknown class ${cls}`);
  for (const [name, c] of Object.entries(d.classes)) {
    closed(c, ["power", "twist", "easeInSeconds", "holdSeconds", "backSeconds", "zoneWeights"]);
    for (const k of ["power", "twist", "easeInSeconds", "holdSeconds", "backSeconds"]) number(F, `${name}.${k}`, c[k], 0);
    closed(c.zoneWeights, ZONES);
    for (const z of ZONES) number(F, `${name}.zoneWeights.${z}`, c.zoneWeights[z], 0);
    if (!(Object.values(c.zoneWeights).reduce((a, b) => a + b, 0) > 0)) fail(F, `${name}.zoneWeights must not all be 0`);
  }
  closed(d.zones, ZONES);
  for (const z of ZONES) {
    const row = d.zones[z];
    closed(row, ["bend", "twist", "fixed"]);
    for (const key of ["bend", "twist"])
      for (const [part, share] of Object.entries(row[key])) {
        if (!PARTS.includes(part)) fail(F, `${z}.${key} names unknown part ${part}`);
        if (!(typeof share === "number" && Number.isFinite(share))) fail(F, `${z}.${key}.${part} must be a number`);
      }
    for (const [part, a] of Object.entries(row.fixed)) {
      if (!PARTS.includes(part)) fail(F, `${z}.fixed names unknown part ${part}`);
      closed(a, ["pitch", "roll"]);
      if (!(Number.isFinite(a.pitch) && Number.isFinite(a.roll))) fail(F, `${z}.fixed.${part} must hold finite pitch and roll`);
    }
  }
}
