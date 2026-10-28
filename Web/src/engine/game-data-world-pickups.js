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
    "markers",
    "models",
    "finish",
    "contour",
    "lookScale",
    "look",
    "looks",
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
  // The ground ring and the name that shows near a pickup: the drop-marker look (visual.json `dropMarker`) with `style` laid over it,
  // then each kind's own label and colours.
  closed(d.markers, ["labelDistance", "style", ...WORLD_PICKUP_TYPES]);
  number("worldPickups", "markers.labelDistance", d.markers.labelDistance, 0.5);
  if (!d.markers.style || typeof d.markers.style !== "object" || Array.isArray(d.markers.style)) fail("worldPickups", "markers.style");
  for (const type of WORLD_PICKUP_TYPES) {
    const m = d.markers[type];
    closed(m, ["label", "ringColour", "labelColour"]);
    if (typeof m.label !== "string" || !m.label.length || m.label.length > 12) fail("worldPickups", `markers.${type}.label`);
    for (const c of [m.ringColour, m.labelColour]) if (typeof c !== "string" || !/^[0-9a-f]{6}$/.test(c)) fail("worldPickups", `markers.${type} colour`);
  }
  closed(d.models, WORLD_PICKUP_TYPES);
  // The worn finish: a part that names a `wear` has its faces cut into a grid and each vertex's colour nudged by a position hash, so
  // the paint reads scuffed instead of flat. These are the grid and hash numbers.
  closed(d.finish, ["gridMetres", "maxCells", "hashScale", "hashSeed", "hashMultiplier", "contrast"]);
  number("worldPickups", "finish.gridMetres", d.finish.gridMetres, 0.005);
  count("worldPickups", "finish.maxCells", d.finish.maxCells, 1, 32);
  number("worldPickups", "finish.hashScale", d.finish.hashScale, 1);
  number("worldPickups", "finish.hashMultiplier", d.finish.hashMultiplier, 1);
  number("worldPickups", "finish.contrast", d.finish.contrast, 0);
  vec("finish.hashSeed", d.finish.hashSeed, -1000);
  const checkParts = (name, parts) => {
    if (!Array.isArray(parts) || parts.length < 1 || parts.length > 24) fail("worldPickups", `${name} must list 1 to 24 parts`);
    for (const p of parts) {
      closed(p, ["shape", "size", "pos", "color"], ["rot", "wear"]);
      if (!["box", "cylinder"].includes(p.shape)) fail("worldPickups", `${name} shape`);
      vec(`${name}.size`, p.size, 0.001);
      vec(`${name}.pos`, p.pos, -10);
      if (p.rot !== undefined && (!Array.isArray(p.rot) || p.rot.length !== 3 || !p.rot.every(Number.isFinite))) fail("worldPickups", `${name} rot`);
      if (p.wear !== undefined && !(Number.isFinite(p.wear) && p.wear > 0 && p.wear <= 1)) fail("worldPickups", `${name} wear`);
      if (typeof p.color !== "string" || !/^[0-9a-f]{6}$/.test(p.color)) fail("worldPickups", `${name} color`);
    }
  };
  for (const [type, parts] of Object.entries(d.models)) checkParts(`models.${type}`, parts);
  // Alternative looks for a kind: `looks.<type>.<name>` lists the parts and `look.<type>` names the one drawn. A kind with no entry in
  // `look` draws its `models` parts.
  // Whether a kind wears the gold contour stroke (appearance.json `pickupGlow`). The worn looks go without it: the stroke traces every
  // small patch and reads as a cartoon outline; their ring and name already mark them.
  closed(d.contour, WORLD_PICKUP_TYPES);
  for (const v of Object.values(d.contour)) if (typeof v !== "boolean") fail("worldPickups", "contour must be true or false");
  closed(d.look, [], WORLD_PICKUP_TYPES);
  closed(d.looks, [], WORLD_PICKUP_TYPES);
  for (const [type, set] of Object.entries(d.looks)) {
    if (!set || typeof set !== "object" || Array.isArray(set) || !Object.keys(set).length) fail("worldPickups", `looks.${type}`);
    for (const [name, parts] of Object.entries(set)) {
      id("worldPickups", `looks.${type} name`, name);
      checkParts(`looks.${type}.${name}`, parts);
    }
  }
  for (const [type, name] of Object.entries(d.look)) if (!d.looks[type]?.[name]) fail("worldPickups", `look.${type} names no look`);
  // How much bigger than its modelled size each look is drawn, so a small pile of rounds still reads from the game camera.
  const lookNames = Object.values(d.looks).flatMap((set) => Object.keys(set));
  for (const [name, s] of Object.entries(d.lookScale)) {
    if (!lookNames.includes(name)) fail("worldPickups", `lookScale.${name} names no look`);
    number("worldPickups", `lookScale.${name}`, s, 0.5);
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
