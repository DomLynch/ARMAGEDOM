// The single game-data loader (Dom, 24 Oct 2026: everything possible lives in data). Every Web/src/data/*.json file is imported HERE
// and nowhere else (the as-data gate fails any other importer), validated, and frozen once at load. Engine code reads GAME_DATA.<name>.
// The sim needs these synchronously at module load, so they are bundled, not fetched. To add a file: put it in Web/src/data/, give it a
// `schema_version`, write its validator below, and list it in sources(). Per-area content stays in Web/public/world/.
import atmosphere from "../data/atmosphere.json" with { type: "json" };
import creatures from "../data/creatures.json" with { type: "json" };
import diagnostics from "../data/diagnostics.json" with { type: "json" };
import renderBudget from "../data/renderBudget.json" with { type: "json" };
import saveClient from "../data/saveClient.json" with { type: "json" };
import visual from "../data/visual.json" with { type: "json" };
import weapons from "../data/weapons.json" with { type: "json" };
import spawns from "../data/spawns.json" with { type: "json" };
import world from "../data/world.json" with { type: "json" };
import worldEvents from "../data/worldEvents.json" with { type: "json" };
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
  closed(d, ["schema_version", "autoEquipOnFirstPickup", "ranged", "knife", "melee", "bossRanged", "vest"]);
  if (typeof d.autoEquipOnFirstPickup !== "boolean") fail("weapons", "autoEquipOnFirstPickup must be true or false");
  if (!d.ranged || typeof d.ranged !== "object" || Array.isArray(d.ranged)) fail("weapons", "ranged must be an object");
  validateKnife(d.knife);
  validateMelee(d.melee);
  validateBossRanged(d.bossRanged);
  validateVest(d.vest);
}
// The Westminster worn vest: its item id and area (both saved identities), the kills that unlock the stash, the pickup radius in
// metres and the share of a hit it absorbs.
export function validateVest(v) {
  closed(v, ["itemId", "areaId", "requiredKills", "pickupRadius", "reduction"]);
  for (const f of ["itemId", "areaId"])
    if (typeof v[f] !== "string" || !/^[a-z0-9-]{1,40}$/.test(v[f])) fail("weapons", `vest.${f}`);
  count("weapons", "vest.requiredKills", v.requiredKills, 0, 100);
  number("weapons", "vest.pickupRadius", v.pickupRadius);
  number("weapons", "vest.reduction", v.reduction);
  if (v.reduction >= 1) fail("weapons", "vest.reduction must be below 1");
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

// creatures.json: the creature bite and low-strike move rows (resolved by creature-moves.js) and the salamander's flame breath.
// A row lists only what it changes from its `extends` parents; the values are plain numbers, strings, booleans or null.
export function validateCreatures(d) {
  closed(d, ["schema_version", "moves", "playerAttacks", "playerHealth", "salamanderBreath", "drone"]);
  // The legacy (non-pilot) player attacks: the four actions, times in seconds, range in metres, arc in degrees.
  closed(d.playerAttacks, ["slash", "stab", "heavy", "special"]);
  for (const [name, row] of Object.entries(d.playerAttacks)) {
    closed(row, ["windup", "recovery", "range", "arc", "multiplier", "stagger", "cooldown"], ["single"]);
    for (const f of ["windup", "recovery", "range", "arc", "multiplier", "stagger", "cooldown"])
      number("creatures", `playerAttacks.${name}.${f}`, row[f]);
    if ("single" in row && typeof row.single !== "boolean") fail("creatures", `playerAttacks.${name}.single`);
  }
  // Health comes back over this many seconds of active play, from empty to full.
  closed(d.playerHealth, ["regenerationSeconds"]);
  number("creatures", "playerHealth.regenerationSeconds", d.playerHealth.regenerationSeconds, 1);
  if (!d.moves || typeof d.moves !== "object" || Array.isArray(d.moves)) fail("creatures", "moves must be an object");
  for (const [name, row] of Object.entries(d.moves)) {
    id("creatures", `moves.${name}`, name.replaceAll("_", "-"));
    if (!row || typeof row !== "object" || Array.isArray(row)) fail("creatures", `moves.${name} must be an object`);
    for (const [field, v] of Object.entries(row)) {
      if (field === "extends") {
        const refs = [v].flat();
        if (!refs.length || !refs.every((r) => typeof r === "string" && r)) fail("creatures", `moves.${name}.extends`);
      } else if (
        !(v === null || ["number", "string", "boolean"].includes(typeof v)) ||
        (typeof v === "number" && !Number.isFinite(v))
      )
        fail("creatures", `moves.${name}.${field} must be a finite number, string, boolean or null`);
    }
    for (const f of ["windupTicks", "activeTicks", "recoveryTicks"])
      if (f in row) count("creatures", `moves.${name}.${f}`, row[f], 1, 600);
  }
  // Every parent must be a knife move or an earlier row (creature-moves.js resolves them in file order).
  const earlier = new Set(),
    knifeIds = ["light_right", "light_left", "thrust", "heavy_overhead", "skill_pommel"];
  for (const [name, row] of Object.entries(d.moves)) {
    for (const ref of [row.extends ?? []].flat())
      if (!(earlier.has(ref) || (ref.startsWith("knife:") && knifeIds.includes(ref.slice(6)))))
        fail("creatures", `moves.${name} extends unknown or later row "${ref}"`);
    earlier.add(name);
  }
  const b = d.salamanderBreath;
  closed(b, [
    "kind",
    "range",
    "coneDegrees",
    "windupTicks",
    "activeTicks",
    "intervalTicks",
    "recoveryTicks",
    "damage",
    "minDistance",
    "acquisitionRange",
  ]);
  if (b.kind !== "flame") fail("creatures", "salamanderBreath.kind");
  for (const f of ["range", "coneDegrees", "damage", "minDistance", "acquisitionRange"])
    number("creatures", `salamanderBreath.${f}`, b[f]);
  for (const f of ["windupTicks", "activeTicks", "intervalTicks", "recoveryTicks"])
    count("creatures", `salamanderBreath.${f}`, b[f], 1, 600);
  // The hover drone (drone-mechanics.js): metres, seconds and hit points. weaponRules() reads its bolt damage for the server rows.
  closed(d.drone, [
    "hoverHeight",
    "hp",
    "radius",
    "moveSpeed",
    "wakeDistance",
    "homeLeash",
    "attackRange",
    "warningSeconds",
    "recoverySeconds",
    "damage",
    "boltSpeed",
    "boltRange",
  ]);
  for (const [name, v] of Object.entries(d.drone)) number("creatures", `drone.${name}`, v);
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
  if (
    !Array.isArray(d.clientLog.kinds) ||
    d.clientLog.kinds.length < 1 ||
    !d.clientLog.kinds.every((k) => /^[a-z]{1,16}$/.test(k))
  )
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
  closed(d, ["schema_version", "survivorVariants", "faces", "clothing", "effects", "dropMarker"]);
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
  // The ground marker on every unclaimed weapon or reward drop (engine/drop-marker.js): a pulsing ring (metres), a short floating label
  // (width and height above the ground in metres) and a gentle pulse of the drop itself (a share of its size).
  const m = d.dropMarker;
  closed(m, [
    "ringInner",
    "ringOuter",
    "glowOuter",
    "glowOpacity",
    "ringPulse",
    "ringColour",
    "labelColour",
    "labelBacking",
    "pulseSeconds",
    "minOpacity",
    "itemPulse",
    "labelHeight",
    "labelWidth",
  ]);
  for (const f of ["ringColour", "labelColour", "labelBacking"]) hex(`dropMarker.${f}`, m[f]);
  for (const f of ["ringInner", "ringOuter", "glowOuter", "pulseSeconds", "labelHeight", "labelWidth"])
    number("visual", `dropMarker.${f}`, m[f], 0.01);
  if (m.ringOuter <= m.ringInner) fail("visual", "dropMarker.ringOuter must exceed ringInner");
  if (m.glowOuter <= m.ringOuter) fail("visual", "dropMarker.glowOuter must exceed ringOuter");
  for (const f of ["glowOpacity", "ringPulse"])
    if (!(m[f] >= 0 && m[f] <= 1)) fail("visual", `dropMarker.${f} must be 0 to 1`);
  if (!(m.minOpacity >= 0 && m.minOpacity <= 1)) fail("visual", "dropMarker.minOpacity must be 0 to 1");
  if (!(m.itemPulse >= 0 && m.itemPulse <= 0.3)) fail("visual", "dropMarker.itemPulse must be 0 to 0.3");
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

// worldEvents.json: how the world-event journal reads the legacy run (engine/world-events.js). The legacy event types that become
// drop events, the legacy pickup event types with the field that names the item, and the persistence dispatchers it wraps.
// Client-side mapping only: the wire schema (event fields, codes, weapon ids) stays in code, the server trusts it.
export function validateWorldEvents(d) {
  closed(d, ["schema_version", "legacyDropEvents", "legacyPickupEvents", "dispatchers"]);
  const names = (list, field) => {
    if (
      !Array.isArray(list) ||
      !list.length ||
      new Set(list).size !== list.length ||
      list.some((n) => typeof n !== "string" || !/^[A-Za-z][A-Za-z0-9-]{0,40}$/.test(n))
    )
      fail("worldEvents", field);
  };
  names(d.legacyDropEvents, "legacyDropEvents");
  names(d.dispatchers, "dispatchers");
  const pickups = d.legacyPickupEvents;
  if (!pickups || typeof pickups !== "object" || Array.isArray(pickups)) fail("worldEvents", "legacyPickupEvents");
  names(Object.keys(pickups), "legacyPickupEvents");
  if (Object.values(pickups).some((field) => !["itemId", "pickupId"].includes(field)))
    fail("worldEvents", "legacyPickupEvents fields must be itemId or pickupId");
}

// atmosphere.json: the painted-fire and smoke anchors per area (atmosphere-areas.js), their presets and quad budgets, and the two
// bridge road bend chains (bridge-steering.js). Coordinates are fractions of the area painting, Y down.
const atmosphereNumbers = () => ["width", "rise", "smoke", "opacity", "fireWidth", "fireHeight", "embers"];
const fraction = (field, v, min = 0, max = 1) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) fail("atmosphere", `${field} must be ${min} to ${max}`);
};
const atmosphereRow = (field, row, allowSmokeColor = true) => {
  for (const key of atmosphereNumbers()) if (Object.hasOwn(row, key)) fraction(`${field}.${key}`, row[key], 0, 16);
  if (Object.hasOwn(row, "smokeColor")) {
    if (!allowSmokeColor || !Array.isArray(row.smokeColor) || row.smokeColor.length !== 3) fail("atmosphere", `${field}.smokeColor`);
    row.smokeColor.forEach((c, i) => fraction(`${field}.smokeColor[${i}]`, c));
  }
};
export function validateAtmosphere(d) {
  closed(d, ["schema_version", "presets", "areas", "budgets", "bends"]);
  const presets = Object.keys(d.presets);
  if (!presets.length) fail("atmosphere", "presets");
  for (const [name, p] of Object.entries(d.presets)) {
    id("atmosphere", "preset", name);
    closed(p, ["width", "rise", "smoke", "opacity", "fireWidth", "fireHeight", "embers"], ["smokeColor"]);
    atmosphereRow(`presets.${name}`, p);
  }
  closed(d.budgets, Object.keys(d.areas));
  for (const [area, rows] of Object.entries(d.areas)) {
    id("atmosphere", "area", area);
    closed(d.budgets[area], ["quads", "drawCalls", "textureBytes"]);
    count("atmosphere", `budgets.${area}.quads`, d.budgets[area].quads, 0, 200);
    count("atmosphere", `budgets.${area}.drawCalls`, d.budgets[area].drawCalls, 0, 20);
    count("atmosphere", `budgets.${area}.textureBytes`, d.budgets[area].textureBytes, 0, 0);
    if (!Array.isArray(rows) || rows.length > 32) fail("atmosphere", `areas.${area} must list up to 32 anchors`);
    const ids = new Set();
    for (const row of rows) {
      closed(
        row,
        ["id", "preset", "x", "y", "seed", "scale", "intensity"],
        ["foot", "depth", ...atmosphereNumbers(), "smokeColor", "preserve"],
      );
      id("atmosphere", `${area} anchor id`, row.id);
      if (ids.has(row.id)) fail("atmosphere", `${area} repeats anchor ${row.id}`);
      ids.add(row.id);
      if (!presets.includes(row.preset)) fail("atmosphere", `${row.id}.preset is not a preset`);
      fraction(`${row.id}.x`, row.x);
      fraction(`${row.id}.y`, row.y);
      count("atmosphere", `${row.id}.seed`, row.seed, 0, 4294967295);
      fraction(`${row.id}.scale`, row.scale, 0.1, 4);
      fraction(`${row.id}.intensity`, row.intensity, 0, 4);
      if (Object.hasOwn(row, "depth") && row.depth !== null) count("atmosphere", `${row.id}.depth`, row.depth, 0, 1000);
      if (Object.hasOwn(row, "foot") && row.foot !== null) {
        closed(row.foot, ["x", "y"]);
        fraction(`${row.id}.foot.x`, row.foot.x);
        fraction(`${row.id}.foot.y`, row.foot.y);
      }
      if (Object.hasOwn(row, "preserve") && row.preserve !== true) fail("atmosphere", `${row.id}.preserve`);
      atmosphereRow(row.id, row);
    }
  }
  closed(d.bends, ["westminster", "east"]);
  for (const [area, chain] of Object.entries(d.bends)) {
    if (!Array.isArray(chain) || chain.length < 2 || chain.length > 32) fail("atmosphere", `bends.${area} must list 2 to 32 points`);
    chain.forEach((p, i) => {
      if (!Array.isArray(p) || p.length !== 2) fail("atmosphere", `bends.${area}[${i}]`);
      fraction(`bends.${area}[${i}].x`, p[0]);
      fraction(`bends.${area}[${i}].y`, p[1]);
    });
  }
}

// name -> [raw json, validator]. A function, not a table, so the loader itself adds nothing to the constant-table baseline.
const sources = () => ({
  atmosphere: [atmosphere, validateAtmosphere],
  creatures: [creatures, validateCreatures],
  diagnostics: [diagnostics, validateDiagnostics],
  renderBudget: [renderBudget, validateRenderBudget],
  saveClient: [saveClient, validateSaveClient],
  spawns: [spawns, validateSpawns],
  visual: [visual, validateVisual],
  weapons: [weapons, validateWeapons],
  world: [world, validateWorld],
  worldEvents: [worldEvents, validateWorldEvents],
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
