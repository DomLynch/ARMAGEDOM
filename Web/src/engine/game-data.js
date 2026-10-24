// The single game-data loader (Dom, 24 Oct 2026: everything possible lives in data). Every Web/src/data/*.json file is imported HERE
// and nowhere else (the as-data gate fails any other importer), validated, and frozen once at load. Engine code reads GAME_DATA.<name>.
// The sim needs these synchronously at module load, so they are bundled, not fetched. To add a file: put it in Web/src/data/, give it a
// `schema_version`, write its validator below, and list it in sources(). Per-area content stays in Web/public/world/.
import diagnostics from "../data/diagnostics.json" with { type: "json" };
import saveClient from "../data/saveClient.json" with { type: "json" };
import weapons from "../data/weapons.json" with { type: "json" };
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
  closed(d, ["schema_version", "statsFramesPerLine"]);
  count("diagnostics", "statsFramesPerLine", d.statsFramesPerLine, 1, 100000);
}

export function validateSaveClient(d) {
  closed(d, ["schema_version", "minSaveIntervalMs", "staleSeqRetries", "characterName"]);
  count("saveClient", "minSaveIntervalMs", d.minSaveIntervalMs, 1000, 600000); // the writer's bucket refills one save per 5 s
  count("saveClient", "staleSeqRetries", d.staleSeqRetries, 0, 5);
  if (typeof d.characterName !== "string" || !/^[\w -]{1,24}$/.test(d.characterName))
    fail("saveClient", "characterName");
}

// weapons.json holds the ranged catalogue. Its per-row rules are enforced by validateRangedWeaponCatalog (engine/weapon-catalog.js),
// which runs on this data when that module loads; the loader checks the shape.
export function validateWeapons(d) {
  closed(d, ["schema_version", "ranged", "knife"]);
  if (!d.ranged || typeof d.ranged !== "object" || Array.isArray(d.ranged)) fail("weapons", "ranged must be an object");
  validateKnife(d.knife);
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
  ]);
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

// name -> [raw json, validator]. A function, not a table, so the loader itself adds nothing to the constant-table baseline.
const sources = () => ({
  diagnostics: [diagnostics, validateDiagnostics],
  saveClient: [saveClient, validateSaveClient],
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
