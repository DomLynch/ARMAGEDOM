// The single game-data loader (Dom, 24 Oct 2026: everything possible lives in data). Every Web/src/data/*.json file is imported HERE
// and nowhere else (the as-data gate fails any other importer), validated, and frozen once at load. Engine code reads GAME_DATA.<name>.
// The sim needs these synchronously at module load, so they are bundled, not fetched. To add a file: put it in Web/src/data/, give it a
// `schema_version`, write its validator below, and list it in sources(). Per-area content stays in Web/public/world/.
import diagnostics from "../data/diagnostics.json" with { type: "json" };
import renderBudget from "../data/renderBudget.json" with { type: "json" };
import saveClient from "../data/saveClient.json" with { type: "json" };
import visual from "../data/visual.json" with { type: "json" };
import weapons from "../data/weapons.json" with { type: "json" };
import spawns from "../data/spawns.json" with { type: "json" };
import world from "../data/world.json" with { type: "json" };
import { closed, freeze } from "./content-schema.js";

export const SUPPORTED_SCHEMA_VERSION = 1;
const fail = (file, why) => {
  throw TypeError(`Invalid game data ${file}: ${why}`);
};
const count = (file, field, value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail(file, `${field} must be an integer from ${min} to ${max}`);
};

export function validateDiagnostics(d) {
  closed(d, ["schema_version", "statsFramesPerLine", "loadStallMs"]);
  count("diagnostics", "statsFramesPerLine", d.statsFramesPerLine, 1, 100000);
  // Enter shows "Retry loading" when no model has finished loading for this long (a stalled connection), instead of waiting forever.
  count("diagnostics", "loadStallMs", d.loadStallMs, 5000, 600000);
}

// A provisional ceiling for what the other players may cost the renderer (measured with scripts/remote-cost.mjs on a real GPU;
// engine/render-budget.js compares a measurement to it). Dom's phone is the judge; these numbers stop the cost creeping meanwhile.
export function validateRenderBudget(d) {
  closed(d, ["schema_version", "provisional", "westminster", "perRemote"]);
  if (typeof d.provisional !== "boolean") fail("renderBudget", "provisional must be true or false");
  closed(d.westminster, ["remotes", "maxDrawCalls", "maxTriangles"]);
  count("renderBudget", "westminster.remotes", d.westminster.remotes, 1, 64);
  count("renderBudget", "westminster.maxDrawCalls", d.westminster.maxDrawCalls, 1, 10000);
  count("renderBudget", "westminster.maxTriangles", d.westminster.maxTriangles, 1, 10000000);
  closed(d.perRemote, ["maxDrawCalls", "maxTriangles"]);
  count("renderBudget", "perRemote.maxDrawCalls", d.perRemote.maxDrawCalls, 0, 1000);
  count("renderBudget", "perRemote.maxTriangles", d.perRemote.maxTriangles, 0, 1000000);
}

export function validateSaveClient(d) {
  closed(d, ["schema_version", "minSaveIntervalMs", "staleSeqRetries", "characterName", "bootSyncWaitMs"]);
  count("saveClient", "bootSyncWaitMs", d.bootSyncWaitMs, 0, 15000); // how long Enter waits for the server record at most
  count("saveClient", "minSaveIntervalMs", d.minSaveIntervalMs, 1000, 600000); // the writer's bucket refills one save per 5 s
  count("saveClient", "staleSeqRetries", d.staleSeqRetries, 0, 5);
  if (typeof d.characterName !== "string" || !/^[\w -]{1,24}$/.test(d.characterName))
    fail("saveClient", "characterName");
}

// weapons.json holds the ranged catalogue. Its per-row rules are enforced by validateRangedWeaponCatalog (engine/weapon-catalog.js),
// which runs on this data when that module loads; the loader checks the shape.
export function validateWeapons(d) {
  closed(d, ["schema_version", "autoEquipOnFirstPickup", "ranged", "knife", "melee", "bossRanged"]);
  if (typeof d.autoEquipOnFirstPickup !== "boolean") fail("weapons", "autoEquipOnFirstPickup must be true or false");
  if (!d.ranged || typeof d.ranged !== "object" || Array.isArray(d.ranged)) fail("weapons", "ranged must be an object");
  validateKnife(d.knife);
  validateMelee(d.melee);
  validateBossRanged(d.bossRanged);
}
// What each ranged boss fires (NPC-only; the player's weapons and ammunition stay separate). Times are seconds, range is metres.
// The rocket also has a flight speed, blast radius, flight time and a live-rocket cap.
export function validateBossRanged(b) {
  closed(b, ["boss-south-nightborn", "boss-butcher"]);
  for (const [rig, row] of Object.entries(b)) {
    closed(
      row,
      ["kind", "field", "modelRef", "warning", "recovery", "range", "damage"],
      ["speed", "radius", "maxLife", "maxLive"],
    );
    for (const f of ["kind", "field", "modelRef"])
      if (typeof row[f] !== "string" || !row[f]) fail("weapons", `bossRanged.${rig}.${f}`);
    for (const f of ["warning", "recovery", "range", "damage", "speed", "radius", "maxLife", "maxLive"])
      if (f in row) number("weapons", `bossRanged.${rig}.${f}`, row[f]);
    if ((row.kind === "rocket") !== "speed" in row) fail("weapons", `bossRanged.${rig} rocket fields`);
  }
}
const number = (file, field, v, min = 0) => {
  if (!Number.isFinite(v) || v < min) fail(file, `${field} must be a finite number >= ${min}`);
};
// The donor knife: tuning rules, the five named moves, the stamina costs and the cooldowns. Moves are rows of named fields (ticks at 60 Hz).
export function validateKnife(k) {
  closed(k, ["rules", "moves", "staminaCosts", "cooldowns"]);
  if (!k.rules || typeof k.rules !== "object") fail("weapons", "knife.rules");
  for (const [name, v] of Object.entries(k.rules)) number("weapons", `knife.rules.${name}`, v);
  const ids = Object.keys(k.moves ?? {});
  if (ids.join() !== "light_right,light_left,thrust,heavy_overhead,skill_pommel") fail("weapons", "knife.moves ids");
  const base = [
    "clip",
    "path",
    "windupTicks",
    "activeTicks",
    "recoveryTicks",
    "damage",
    "staminaDamage",
    "staggerTicks",
    "chip",
    "reach",
    "stepIn",
    "knockback",
    "sourceContact",
    "stamina",
  ];
  for (const id of ids) {
    const row = k.moves[id];
    closed(row, id === "skill_pommel" ? [...base, "cooldown"] : base);
    if (typeof row.clip !== "string" || !(row.path === null || typeof row.path === "string"))
      fail("weapons", `knife.moves.${id} clip/path`);
    for (const f of base.slice(2)) number("weapons", `knife.moves.${id}.${f}`, row[f]);
    for (const f of ["windupTicks", "activeTicks", "recoveryTicks", "staggerTicks"])
      count("weapons", `knife.moves.${id}.${f}`, row[f], 0, 600);
  }
  closed(k.staminaCosts, ["slash", "stab", "heavy", "special", "dodge"]);
  for (const [name, v] of Object.entries(k.staminaCosts)) number("weapons", `knife.staminaCosts.${name}`, v);
  closed(k.cooldowns, ["heavy", "special", "dodgeTicks"]);
  for (const [name, v] of Object.entries(k.cooldowns)) number("weapons", `knife.cooldowns.${name}`, v);
}

// The two knife variants. Each move row lists only the fields that differ from the knife move of the same id; the code derives the
// rest (seconds, step-in, reach, contact paths) from the knife and the traced paths. Ticks are at 60 Hz.
export function validateMelee(m) {
  closed(m, ["boneSaw", "cleaver"]);
  const moves = (variant, rows, fields) => {
    closed(rows, ["light_right", "light_left", "thrust", "heavy_overhead"]);
    for (const [id, row] of Object.entries(rows)) {
      closed(row, fields);
      for (const f of fields) number("weapons", `melee.${variant}.moves.${id}.${f}`, row[f]);
    }
  };
  const pair = (variant, v) => {
    if (!Array.isArray(v) || v.length !== 2) fail("weapons", `melee.${variant}.contact must be two numbers`);
    v.forEach((n, i) => number("weapons", `melee.${variant}.contact[${i}]`, n));
  };
  const costs = (variant, c, fields) => {
    closed(c, fields);
    for (const f of fields) number("weapons", `melee.${variant}.costs.${f}`, c[f]);
  };
  const saw = m.boneSaw;
  closed(saw, ["name", "modelVariantId", "contact", "moves", "costs"]);
  if (typeof saw.name !== "string" || typeof saw.modelVariantId !== "string")
    fail("weapons", "melee.boneSaw name/model");
  pair("boneSaw", saw.contact);
  moves("boneSaw", saw.moves, ["damage", "stamina"]);
  costs("boneSaw", saw.costs, ["slash", "stab", "heavy"]);
  const cleaver = m.cleaver;
  closed(cleaver, ["contact", "targeting", "clipOverrides", "moves", "costs", "lowMoves"]);
  pair("cleaver", cleaver.contact);
  closed(cleaver.targeting, ["nearest", "coneDegrees"]);
  if (typeof cleaver.targeting.nearest !== "boolean") fail("weapons", "melee.cleaver.targeting.nearest");
  number("weapons", "melee.cleaver.targeting.coneDegrees", cleaver.targeting.coneDegrees);
  for (const [from, to] of Object.entries(cleaver.clipOverrides ?? {}))
    if (typeof to !== "string") fail("weapons", `melee.cleaver.clipOverrides.${from}`);
  const ticks = ["windupTicks", "activeTicks", "recoveryTicks"];
  moves("cleaver", cleaver.moves, ["damage", "stamina", ...ticks, "staggerTicks"]);
  for (const row of Object.values(cleaver.moves))
    for (const f of ticks) count("weapons", `melee.cleaver.moves.${f}`, row[f], 1, 600);
  costs("cleaver", cleaver.costs, ["slash", "stab", "heavy", "special", "dodge"]);
  for (const [rig, row] of Object.entries(cleaver.lowMoves ?? {})) {
    closed(row, ["clip", "slashMoveId", "includeRadius", ...ticks]);
    if (typeof row.clip !== "string" || typeof row.slashMoveId !== "string" || typeof row.includeRadius !== "boolean")
      fail("weapons", `melee.cleaver.lowMoves.${rig}`);
    for (const f of ticks) count("weapons", `melee.cleaver.lowMoves.${rig}.${f}`, row[f], 1, 600);
  }
}

export function validateWorld(d) {
  closed(d, [
    "schema_version",
    "statusPath",
    "statusTimeoutMs",
    "recheckMinMs",
    "presenceBackoffMs",
    "closedCloseCodes",
    "closedRefuseReasons",
    "closedError",
    "clientLog",
  ]);
  // The error beacon (engine/client-log.js): one batch at most every minIntervalMs, at most maxEvents rows in it.
  closed(d.clientLog, ["path", "kinds", "minIntervalMs", "maxEvents", "maxDistinct", "messageChars", "maxBodyBytes"]);
  if (!Array.isArray(d.clientLog.kinds) || d.clientLog.kinds.length < 1 || !d.clientLog.kinds.every((k) => /^[a-z]{1,16}$/.test(k)))
    fail("world", "clientLog.kinds");
  count("world", "clientLog.maxBodyBytes", d.clientLog.maxBodyBytes, 500, 4000); // the writer refuses a body over 4096 bytes
  if (typeof d.clientLog.path !== "string" || !/^\/arma\/api\/[a-z_]{1,24}$/.test(d.clientLog.path))
    fail("world", "clientLog.path");
  count("world", "clientLog.minIntervalMs", d.clientLog.minIntervalMs, 5000, 3600000);
  count("world", "clientLog.maxEvents", d.clientLog.maxEvents, 1, 10);
  count("world", "clientLog.maxDistinct", d.clientLog.maxDistinct, 1, 200);
  count("world", "clientLog.messageChars", d.clientLog.messageChars, 20, 200);
  if (typeof d.statusPath !== "string" || !/^\/arma\/api\/[a-z_]{1,24}$/.test(d.statusPath))
    fail("world", "statusPath");
  count("world", "statusTimeoutMs", d.statusTimeoutMs, 500, 60000);
  count("world", "recheckMinMs", d.recheckMinMs, 5000, 3600000);
  if (!Array.isArray(d.presenceBackoffMs) || d.presenceBackoffMs.length < 1 || d.presenceBackoffMs.length > 12)
    fail("world", "presenceBackoffMs must list 1 to 12 delays");
  d.presenceBackoffMs.forEach((ms, i) => {
    count("world", `presenceBackoffMs[${i}]`, ms, 250, 120000);
    if (i > 0 && ms < d.presenceBackoffMs[i - 1]) fail("world", "presenceBackoffMs must not shrink");
  });
  if (!Array.isArray(d.closedCloseCodes)) fail("world", "closedCloseCodes");
  d.closedCloseCodes.forEach((code) => count("world", "closedCloseCodes", code, 4000, 4999));
  if (!Array.isArray(d.closedRefuseReasons) || !d.closedRefuseReasons.every((r) => /^[a-z-]{1,24}$/.test(r)))
    fail("world", "closedRefuseReasons");
  if (typeof d.closedError !== "string" || !/^[A-Za-z0-9_-]{1,16}$/.test(d.closedError)) fail("world", "closedError");
}

// visual.json: how things look (survivor outfits, face ingredients, clothing swatches, effect colours). Colours are 6-digit hex strings
// or channel factors; the code derives its recipes from these rows.
const id = (file, field, v) => {
  if (typeof v !== "string" || !/^[a-z0-9-]{1,24}$/.test(v)) fail(file, `${field} must be a lowercase id`);
};
const hex = (field, v) => {
  if (typeof v !== "string" || !/^[0-9a-f]{6}$/.test(v)) fail("visual", `${field} must be 6 lowercase hex digits`);
};
const channels = (field, v, max) => {
  if (!Array.isArray(v) || v.length !== 3) fail("visual", `${field} must be three channels`);
  v.forEach((c, i) => {
    number("visual", `${field}[${i}]`, c);
    if (c > max) fail("visual", `${field}[${i}] above ${max}`);
  });
};
const unique = (field, ids) => {
  if (new Set(ids).size !== ids.length) fail("visual", `${field} has a repeated id`);
};
const list = (field, v, min, max) => {
  if (!Array.isArray(v) || v.length < min || v.length > max) fail("visual", `${field} must list ${min} to ${max} rows`);
};
export function validateVisual(d) {
  closed(d, ["schema_version", "survivorVariants", "faces", "clothing", "effects"]);
  list("survivorVariants", d.survivorVariants, 1, 64);
  for (const v of d.survivorVariants) {
    closed(v, ["id", "garment", "accent"]);
    id("visual", "survivorVariants id", v.id);
    channels(`survivorVariants.${v.id}.garment`, v.garment, 2);
    channels(`survivorVariants.${v.id}.accent`, v.accent, 2);
  }
  unique(
    "survivorVariants",
    d.survivorVariants.map((v) => v.id),
  );
  const f = d.faces;
  closed(f, ["version", "heads", "hairs", "skins", "weathering"]);
  if (typeof f.version !== "string" || !/^[a-z0-9-]{1,40}$/.test(f.version)) fail("visual", "faces.version");
  list("faces.heads", f.heads, 1, 16);
  for (const h of f.heads) {
    closed(h, ["id", "width", "height"]);
    id("visual", "faces.heads id", h.id);
    number("visual", "faces.heads width", h.width, 0.1);
    number("visual", "faces.heads height", h.height, 0.1);
  }
  list("faces.skins", f.skins, 1, 16);
  for (const s of f.skins) {
    closed(s, ["id", "photo"]);
    id("visual", "faces.skins id", s.id);
    channels(`faces.skins.${s.id}.photo`, s.photo, 4);
  }
  for (const name of ["hairs", "weathering"]) {
    list(`faces.${name}`, f[name], 1, 16);
    f[name].forEach((v) => id("visual", `faces.${name}`, v));
  }
  unique(
    "faces.heads",
    f.heads.map((h) => h.id),
  );
  unique(
    "faces.skins",
    f.skins.map((s) => s.id),
  );
  unique("faces.hairs", f.hairs);
  unique("faces.weathering", f.weathering);
  const c = d.clothing;
  closed(c, ["version", "tops", "trousers", "partners"]);
  if (typeof c.version !== "string" || !/^[a-z0-9-]{1,40}$/.test(c.version)) fail("visual", "clothing.version");
  const families = (name) => {
    list(`clothing.${name}`, c[name], 1, 64);
    for (const [family, ...swatches] of c[name]) {
      id("visual", `clothing.${name} family`, family);
      list(`clothing.${name}.${family}`, swatches, 1, 16);
      swatches.forEach((h) => hex(`clothing.${name}.${family}`, h));
    }
    unique(
      `clothing.${name}`,
      c[name].map((row) => row[0]),
    );
    return c[name].map((row) => row[0]);
  };
  const topFamilies = families("tops");
  const trouserFamilies = new Set(families("trousers"));
  closed(c.partners, topFamilies);
  for (const family of topFamilies) {
    list(`clothing.partners.${family}`, c.partners[family], 1, 64);
    for (const p of c.partners[family])
      if (!trouserFamilies.has(p)) fail("visual", `clothing.partners.${family} names unknown trousers family ${p}`);
  }
  closed(d.effects, ["swingColours", "lootColours"]);
  closed(d.effects.swingColours, ["slash", "stab", "heavy", "special"]);
  for (const [name, h] of Object.entries(d.effects.swingColours)) hex(`effects.swingColours.${name}`, h);
  list("effects.lootColours", d.effects.lootColours, 1, 16);
  d.effects.lootColours.forEach((h) => hex("effects.lootColours", h));
}

// spawns.json: the resident and drone placements of the areas whose rows were code before the data layer (Westminster, East, South),
// and which of those residents walk with the crooked gait. The rest of the area-content rules (geometry, creature identity, health
// range, a boss or unique-reward row naming a placement) are checked where the rows are used (engine/area-content.js).
export function validateSpawns(d) {
  closed(d, ["schema_version", "mob", "drones", "crookedResidents"]);
  const keys = new Set(),
    point = (name, p) => {
      closed(p, ["x", "z"]);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) fail("spawns", `${name} must be finite`);
    };
  for (const [table, rows] of [
    ["mob", d.mob],
    ["drones", d.drones],
  ]) {
    if (!rows || typeof rows !== "object" || Array.isArray(rows)) fail("spawns", `${table} must be an object by area`);
    for (const [area, list] of Object.entries(rows)) {
      if (!/^[a-z][a-z0-9-]*$/.test(area) || !Array.isArray(list)) fail("spawns", `${table}.${area}`);
      for (const row of list) {
        closed(row, ["key", "pos", "patrol"], ["appearanceRef", "encounter", "foundationRef", "recipeRef"]);
        if (typeof row.key !== "string" || !/^[a-z][a-z0-9-]*$/.test(row.key) || keys.has(row.key))
          fail("spawns", `${table}.${area} key`);
        keys.add(row.key);
        point(`${row.key}.pos`, row.pos);
        if (!Array.isArray(row.patrol) || row.patrol.length < 2) fail("spawns", `${row.key}.patrol`);
        row.patrol.forEach((p) => point(`${row.key}.patrol`, p));
      }
    }
  }
  if (!Array.isArray(d.crookedResidents) || new Set(d.crookedResidents).size !== d.crookedResidents.length)
    fail("spawns", "crookedResidents");
  const mobKeys = new Set(Object.values(d.mob).flatMap((list) => list.map((row) => row.key)));
  if (d.crookedResidents.some((key) => !mobKeys.has(key))) fail("spawns", "crookedResidents must name a mob row");
}

// name -> [raw json, validator]. A function, not a table, so the loader itself adds nothing to the constant-table baseline.
const sources = () => ({
  diagnostics: [diagnostics, validateDiagnostics],
  renderBudget: [renderBudget, validateRenderBudget],
  saveClient: [saveClient, validateSaveClient],
  spawns: [spawns, validateSpawns],
  visual: [visual, validateVisual],
  weapons: [weapons, validateWeapons],
  world: [world, validateWorld],
});

/**
 * Validates and freezes each source. Every file must declare the supported `schema_version`; a validator throws on anything else
 * (unknown or missing fields included). Returns a frozen object keyed by file name; the raw imports are never exposed.
 */
export function buildGameData(files = sources()) {
  const out = {};
  for (const [name, [raw, validate]] of Object.entries(files)) {
    const data = structuredClone(raw);
    if (data?.schema_version !== SUPPORTED_SCHEMA_VERSION)
      fail(name, `schema_version must be ${SUPPORTED_SCHEMA_VERSION}`);
    validate(data);
    out[name] = data;
  }
  return freeze(out);
}

export const GAME_DATA = buildGameData();
