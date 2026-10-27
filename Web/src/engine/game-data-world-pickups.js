// worldPickups.json: ground pickups hidden in each area (medkit, ammo box, cash stash). Item rules, respawn timer, toast text, the
// procedural model parts and the per-area placements. The loader (engine/game-data.js) imports the JSON; engine/world-pickups-core.js
// runs it. Placements are checked against the real road geometry in tests/world-pickups.test.js.
import { closed } from "./content-schema.js";
import { count, fail, id, number } from "./game-data-checks.js";

const vec = (field, v, min) => {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((n) => Number.isFinite(n) && n >= min))
    fail("worldPickups", `${field} must be three numbers`);
};

export function validateWorldPickups(d) {
  const WORLD_PICKUP_TYPES = ["medkit", "ammoBox", "cashStash"];
  closed(d, [
    "schema_version",
    "respawnSeconds",
    "pickupRadius",
    "offscreenMargin",
    "spotHeight",
    "cylinderSegments",
    "displayScale",
    "roughness",
    "metalness",
    "noticeSeconds",
    "refusalRepeatSeconds",
    "items",
    "text",
    "models",
    "placements",
  ]);
  number("worldPickups", "respawnSeconds", d.respawnSeconds, 1);
  number("worldPickups", "pickupRadius", d.pickupRadius, 0.2);
  number("worldPickups", "offscreenMargin", d.offscreenMargin, 0);
  number("worldPickups", "spotHeight", d.spotHeight, 0);
  number("worldPickups", "displayScale", d.displayScale, 0.1);
  number("worldPickups", "roughness", d.roughness, 0);
  number("worldPickups", "metalness", d.metalness, 0);
  count("worldPickups", "cylinderSegments", d.cylinderSegments, 3, 64);
  number("worldPickups", "noticeSeconds", d.noticeSeconds, 0.5);
  number("worldPickups", "refusalRepeatSeconds", d.refusalRepeatSeconds, 0.5);
  closed(d.items, WORLD_PICKUP_TYPES);
  closed(d.items.medkit, ["healFraction"]);
  if (!(d.items.medkit.healFraction > 0 && d.items.medkit.healFraction <= 1)) fail("worldPickups", "healFraction must be above 0 and at most 1");
  closed(d.items.ammoBox, []);
  closed(d.items.cashStash, ["min", "max", "step"]);
  const cash = d.items.cashStash;
  count("worldPickups", "cashStash.min", cash.min, 1, 100000);
  count("worldPickups", "cashStash.step", cash.step, 1, 100000);
  count("worldPickups", "cashStash.max", cash.max, cash.min, 100000);
  if ((cash.max - cash.min) % cash.step) fail("worldPickups", "cashStash range must be a whole number of steps");
  closed(d.text, [...WORLD_PICKUP_TYPES, "medkitFull", "ammoBoxFull", "cashStashFull"]);
  for (const [k, v] of Object.entries(d.text)) if (typeof v !== "string" || !v.length || v.length > 60) fail("worldPickups", `text.${k}`);
  if (!d.text.medkit.includes("{amount}") || !d.text.cashStash.includes("{amount}")) fail("worldPickups", "text needs {amount}");
  closed(d.models, WORLD_PICKUP_TYPES);
  for (const [type, parts] of Object.entries(d.models)) {
    if (!Array.isArray(parts) || parts.length < 1 || parts.length > 8) fail("worldPickups", `models.${type} must list 1 to 8 parts`);
    for (const p of parts) {
      closed(p, ["shape", "size", "pos", "color"]);
      if (!["box", "cylinder"].includes(p.shape)) fail("worldPickups", `models.${type} shape`);
      vec(`models.${type}.size`, p.size, 0.001);
      vec(`models.${type}.pos`, p.pos, -10);
      if (typeof p.color !== "string" || !/^[0-9a-f]{6}$/.test(p.color)) fail("worldPickups", `models.${type} color`);
    }
  }
  if (!d.placements || typeof d.placements !== "object" || Array.isArray(d.placements)) fail("worldPickups", "placements");
  const seen = new Set();
  for (const [area, list] of Object.entries(d.placements)) {
    id("worldPickups", "placements area", area);
    if (area === "central-hub") fail("worldPickups", "the central-hub safehouse has no pickups");
    if (!Array.isArray(list) || list.length < 1 || list.length > 8) fail("worldPickups", `placements.${area} must list 1 to 8`);
    for (const row of list) {
      closed(row, ["id", "type", "x", "z"]);
      if (typeof row.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(row.id) || seen.has(row.id)) fail("worldPickups", `placement id ${row.id}`);
      seen.add(row.id);
      if (!WORLD_PICKUP_TYPES.includes(row.type)) fail("worldPickups", `placement ${row.id} type`);
      if (!Number.isFinite(row.x) || !Number.isFinite(row.z)) fail("worldPickups", `placement ${row.id} position`);
    }
  }
}
