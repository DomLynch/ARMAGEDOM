// pitbornCuts.json (engine/finisher-cuts.js, engine/physics-death-impl.js): the Pitborn's dismemberment finishers. Which package cut units each
// finisher takes and when, which finishers each weapon may roll, the seeded pick (chance, pity, no repeat) and the cap tint. Mirrors the six
// finishers of Frankendom V3 (data/physics.json finisherCuts); the rows are validated here so the engine holds no tuning number.
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

const FILE = "pitbornCuts";
const VISUAL = ["head_split", "belly_open"];
const colour = (v, what) => {
  if (typeof v !== "string" || !/^[0-9a-f]{6}$/i.test(v)) fail(FILE, `${what} must be a 6 digit hex colour`);
};

export function validatePitbornCuts(d) {
  closed(d, [
    "schema_version",
    "flagParam",
    "offValue",
    "defaultOn",
    "rigRef",
    "weaponSocket",
    "assets",
    "seed",
    "chance",
    "pityAfter",
    "noRepeat",
    "maxPieceBodies",
    "capTint",
    "units",
    "finishers",
    "bindings",
  ]);
  if (typeof d.defaultOn !== "boolean" || typeof d.noRepeat !== "boolean") fail(FILE, "defaultOn and noRepeat must be true or false");
  for (const k of ["flagParam", "offValue", "rigRef", "weaponSocket"])
    if (typeof d[k] !== "string" || !d[k]) fail(FILE, `${k} must be a non-empty string`);
  closed(d.assets, ["glb", "manifest"]);
  for (const k of ["glb", "manifest"]) if (typeof d.assets[k] !== "string" || d.assets[k].startsWith("/")) fail(FILE, `assets.${k} must be a relative path`);
  count(FILE, "seed", d.seed, 1, 2 ** 31);
  number(FILE, "chance", d.chance, 0);
  if (d.chance > 1) fail(FILE, "chance must be 0 to 1");
  count(FILE, "pityAfter", d.pityAfter, 1, 20);
  count(FILE, "maxPieceBodies", d.maxPieceBodies, 1, 32);
  closed(d.capTint, ["flesh", "inner", "blood", "amount"]);
  for (const k of ["flesh", "inner", "blood"]) colour(d.capTint[k], `capTint.${k}`);
  number(FILE, "capTint.amount", d.capTint.amount, 0);
  if (!Array.isArray(d.units) || new Set(d.units).size !== d.units.length || !d.units.every((u) => typeof u === "string"))
    fail(FILE, "units must list each package cut unit once");
  const known = new Set(d.units);
  const unit = (u, what) => {
    if (!known.has(u)) fail(FILE, `${what} names unit "${u}" that units does not list`);
  };
  const ids = Object.keys(d.finishers);
  if (!ids.length) fail(FILE, "finishers must not be empty");
  for (const [id, row] of Object.entries(d.finishers)) {
    closed(row, ["unit", "also", "alsoAtS", "atS", "push", "pieceImpulse"], ["fallback"]);
    unit(row.unit, `${id}.unit`);
    if (!Array.isArray(row.also)) fail(FILE, `${id}.also must be a list`);
    for (const u of row.also) unit(u, `${id}.also`);
    if (row.fallback !== undefined && row.fallback !== null) unit(row.fallback, `${id}.fallback`);
    if (VISUAL.includes(row.fallback)) fail(FILE, `${id}.fallback must be a unit that detaches something`);
    for (const k of ["alsoAtS", "atS", "push", "pieceImpulse"]) number(FILE, `${id}.${k}`, row[k], 0);
  }
  if (!Array.isArray(d.bindings) || !d.bindings.length) fail(FILE, "bindings must be a non-empty list");
  const seen = new Set();
  for (const [i, b] of d.bindings.entries()) {
    closed(b, ["weapons", "pool"]);
    if (!Array.isArray(b.weapons) || !b.weapons.length || !b.weapons.every((w) => typeof w === "string"))
      fail(FILE, `bindings[${i}].weapons must list weapon keys`);
    for (const w of b.weapons) {
      if (seen.has(w)) fail(FILE, `weapon "${w}" is bound twice`);
      seen.add(w);
    }
    if (!Array.isArray(b.pool) || !b.pool.length) fail(FILE, `bindings[${i}].pool must be a non-empty list`);
    for (const p of b.pool) {
      closed(p, ["id", "weight"]);
      if (!ids.includes(p.id)) fail(FILE, `bindings[${i}] names unknown finisher "${p.id}"`);
      count(FILE, `bindings[${i}].weight`, p.weight, 1, 100);
    }
  }
}
