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
  ]);
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
  for (const [rig, tier] of Object.entries(d.rigTiers)) if (!/^[a-z0-9-]{1,40}$/.test(rig) || !TIERS.includes(tier)) fail("killDrops", `rigTiers.${rig}`);
  closed(d.tiers, TIERS);
  closed(d.models, Object.values(d.tiers).map((t) => t.model));
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
  for (const [k, v] of Object.entries(d.text)) if (typeof v !== "string" || !v.length || v.length > 60) fail("killDrops", `text.${k}`);
  if (!d.text.picked.includes("{amount}")) fail("killDrops", "text.picked needs {amount}");
  for (const [name, parts] of Object.entries(d.models)) {
    if (!Array.isArray(parts) || parts.length < 1 || parts.length > 16) fail("killDrops", `models.${name} must list 1 to 16 parts`);
    for (const p of parts) {
      closed(p, ["shape", "size", "pos", "color"]);
      if (p.shape !== "cylinder") fail("killDrops", `models.${name} shape`);
      if (!Array.isArray(p.size) || p.size.length !== 2 || !p.size.every((n) => Number.isFinite(n) && n >= 0.001)) fail("killDrops", `models.${name}.size`);
      if (!Array.isArray(p.pos) || p.pos.length !== 3 || !p.pos.every((n) => Number.isFinite(n) && Math.abs(n) <= 10)) fail("killDrops", `models.${name}.pos`);
      if (typeof p.color !== "string" || !/^[0-9a-f]{6}$/.test(p.color)) fail("killDrops", `models.${name} color`);
    }
  }
}
