// creatures.json validators, split out of game-data.js (which re-exports validateCreatures) to keep the loader small. Same checks, same messages.
import { closed } from "./content-schema.js";
import * as extra from "./appearance-extra-validators.js";
import { count, fail, id, number } from "./game-data-checks.js";

// creatures.json: the creature bite and low-strike move rows (resolved by creature-moves.js) and the salamander's flame breath.
// A row lists only what it changes from its `extends` parents; the values are plain numbers, strings, booleans or null.
export function validateCreatures(d) {
  closed(d, [
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
  ]);
  // creatureSim.playerFields: the report fields engine/creature-sim.js copies onto a player entity each step.
  closed(d.creatureSim, ["playerFields"]);
  if (d.creatureSim.playerFields.join() !== "hp,dodgeUntil,guarding,parryUntil,stamina")
    fail("creatures", "creatureSim.playerFields must be hp, dodgeUntil, guarding, parryUntil, stamina");
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
  // The hit and death reaction of a rig with no row of its own in creatures.json rigCapabilities (rig-response.js).
  closed(d.defaultResponse, ["hitClip", "deathClip", "deathTicks"]);
  for (const f of ["hitClip", "deathClip"])
    if (typeof d.defaultResponse[f] !== "string" || !d.defaultResponse[f]) fail("creatures", `defaultResponse.${f}`);
  count("creatures", "defaultResponse.deathTicks", d.defaultResponse.deathTicks, 1, 600);
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
  // The creature catalogue (engine/creature-catalogue.js): per reviewed foundation, the controller, weapon, rig and clip actions it must
  // carry, and the native contact reach in metres. The catalogue still checks each foundation row against these.
  closed(d.catalogue, ["support", "reach"]);
  for (const [name, row] of Object.entries(d.catalogue.support)) {
    id("creatures", `catalogue.support.${name}`, name);
    closed(row, ["controller", "weapon", "rig", "actions"]);
    for (const f of ["controller", "weapon"])
      if (typeof row[f] !== "string" || !row[f]) fail("creatures", `catalogue.support.${name}.${f}`);
    if (row.rig !== null && (typeof row.rig !== "string" || !row.rig)) fail("creatures", `catalogue.support.${name}.rig`);
    if (!Array.isArray(row.actions) || !row.actions.every((a) => typeof a === "string" && a))
      fail("creatures", `catalogue.support.${name}.actions`);
  }
  for (const [name, v] of Object.entries(d.catalogue.reach)) {
    id("creatures", `catalogue.reach.${name}`, name);
    number("creatures", `catalogue.reach.${name}`, v);
    if (!Object.hasOwn(d.catalogue.support, name)) fail("creatures", `catalogue.reach.${name} has no support row`);
  }
  validateBehaviours(d.behaviours);
  validateEncounterTables(d);
  extra.validateMobSize(d.mobSize, { fail, number });
  validateRigTables(d);
}

// creatures.json feralBodyShapes, feralCoatProfiles, gauntShape, rigCapabilities: recipe ids are unique; a capability is a flag, name or number.
function validateRigTables(d) {
  const recipeId = (field, v) => {
    if (typeof v !== "string" || !/^[a-z0-9-]{1,40}$/.test(v)) fail("creatures", `${field} must be a lowercase id`);
  };
  const rows = (table, fields) => {
    if (!Array.isArray(d[table]) || !d[table].length) fail("creatures", `${table} must be a non-empty list`);
    const seen = new Set();
    d[table].forEach((row, i) => {
      closed(row, fields);
      recipeId(`${table}[${i}].id`, row.id);
      if (seen.has(row.id)) fail("creatures", `${table} lists ${row.id} twice`);
      seen.add(row.id);
    });
  };
  rows("feralBodyShapes", ["id", "width"]);
  for (const row of d.feralBodyShapes) number("creatures", `feralBodyShapes.${row.id}.width`, row.width, 0.1);
  rows("feralCoatProfiles", ["id", "tint", "shapePending"]);
  for (const row of d.feralCoatProfiles) {
    if (!Array.isArray(row.tint) || row.tint.length !== 3) fail("creatures", `feralCoatProfiles.${row.id}.tint must be three channels`);
    row.tint.forEach((c, i) => number("creatures", `feralCoatProfiles.${row.id}.tint[${i}]`, c));
    if (typeof row.shapePending !== "boolean") fail("creatures", `feralCoatProfiles.${row.id}.shapePending`);
  }
  // Every profile that waits on a body shape must have one.
  for (const row of d.feralCoatProfiles)
    if (row.shapePending && !d.feralBodyShapes.some((s) => s.id === row.id))
      fail("creatures", `feralCoatProfiles.${row.id} is shapePending but has no feralBodyShapes row`);
  closed(d.gauntShape, ["targets", "segments"]);
  if (!Array.isArray(d.gauntShape.targets) || !d.gauntShape.targets.length || !d.gauntShape.targets.every((n) => typeof n === "string" && n))
    fail("creatures", "gauntShape.targets must be a list of node names");
  const bone = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;
  for (const [name, row] of Object.entries(d.gauntShape.segments)) {
    if (!bone.test(name)) fail("creatures", `gauntShape.segments.${name} is not a bone name`);
    if (!Array.isArray(row) || row.length !== 2 || !bone.test(row[0])) fail("creatures", `gauntShape.segments.${name} must be [childBone, factor]`);
    number("creatures", `gauntShape.segments.${name}[1]`, row[1], 0.1);
    if (row[1] > 1) fail("creatures", `gauntShape.segments.${name}[1] above 1`);
  }
  if (!Object.keys(d.gauntShape.segments).length) fail("creatures", "gauntShape.segments is empty");
  if (!Object.keys(d.rigCapabilities).length) fail("creatures", "rigCapabilities is empty");
  for (const [rig, row] of Object.entries(d.rigCapabilities)) {
    id("creatures", `rigCapabilities.${rig}`, rig);
    if (!row || typeof row !== "object" || Array.isArray(row)) fail("creatures", `rigCapabilities.${rig} must be an object`);
    // A capability is a flag (true or false), a name (a clip) or a measured number (0 or more), read with rigCapability / rigText / rigNumber.
    for (const [name, value] of Object.entries(row)) {
      if (!/^[a-z][A-Za-z]{0,30}$/.test(name)) fail("creatures", `rigCapabilities.${rig}.${name} is not a capability name`);
      if (typeof value === "string") {
        if (!value) fail("creatures", `rigCapabilities.${rig}.${name} must not be empty`);
      } else if (typeof value !== "boolean") number("creatures", `rigCapabilities.${rig}.${name}`, value);
    }
  }
}

// creatures.json `animalCycles`, `gauntHumanCycles` and `hollowTuning` (animal-cycle.js, gaunt-human-bindings.js, hollow-encounter.js).
// Cycle rows pair a roamer placement key with a creature recipe (animals) or an area with the placement key that gets the gaunt body.
function validateEncounterTables(d) {
  const word = (field, v, pattern) => {
    if (typeof v !== "string" || !pattern.test(v)) fail("creatures", `${field} has an invalid name`);
  };
  for (const [table, keyPattern, valuePattern] of [
    ["animalCycles", /^[a-z]+-roamer-\d+$/, /^[a-z0-9-]{1,40}$/],
    ["gauntHumanCycles", /^[a-z][a-z0-9-]{0,40}$/, /^[a-z]+-roamer-\d+$/],
  ]) {
    closed(d[table], ["A", "B"]);
    for (const cycle of ["A", "B"]) {
      const rows = Object.entries(d[table][cycle]);
      if (!rows.length) fail("creatures", `${table}.${cycle} is empty`);
      for (const [key, value] of rows) {
        word(`${table}.${cycle}`, key, keyPattern);
        word(`${table}.${cycle}.${key}`, value, valuePattern);
      }
    }
  }
  if (Object.keys(d.animalCycles.A).join() !== Object.keys(d.animalCycles.B).join())
    fail("creatures", "animalCycles A and B must list the same placement keys");
  // The ranges createHollowEncounter enforces on the encounter built from these.
  closed(d.hollowTuning, ["count", "health", "moveSpeed", "regen", "aggression", "recovery"]);
  count("creatures", "hollowTuning.count", d.hollowTuning.count, 3, 5);
  for (const [field, min, max] of [["health", 1, 120], ["moveSpeed", 0.1, 6], ["regen", 0.1, 2], ["aggression", 0.1, 5], ["recovery", 0, 5]]) {
    const v = d.hollowTuning[field];
    if (!Number.isFinite(v) || v < min || v > max) fail("creatures", `hollowTuning.${field} must be from ${min} to ${max}`);
  }
}

// creatures.json `behaviours`: the per-resident tuning presets and wake/leash/retreat intents (creature-behaviour-presets.js and
// creature-behaviour-intents.js resolve them), and which preset and intent each creature recipe uses. Intent rows carry every field.
function validateBehaviours(b) {
  closed(b, ["presets", "recipeBehaviours", "intents", "recipeIntents"]);
  const name = (field, v) => {
    if (typeof v !== "string" || !/^[a-z0-9-]{1,40}$/.test(v)) fail("creatures", `behaviours.${field} must be a lowercase name`);
  };
  for (const [preset, row] of Object.entries(b.presets)) {
    name(`presets.${preset}`, preset);
    closed(row, "attackPattern" in row ? ["speedFactor", "recoveryAdd", "attackPattern"] : ["speedFactor", "recoveryAdd"]);
    number("creatures", `behaviours.presets.${preset}.speedFactor`, row.speedFactor, 0.1);
    number("creatures", `behaviours.presets.${preset}.recoveryAdd`, row.recoveryAdd);
    if ("attackPattern" in row && !(Array.isArray(row.attackPattern) && row.attackPattern.length && row.attackPattern.every((a) => typeof a === "string" && a)))
      fail("creatures", `behaviours.presets.${preset}.attackPattern`);
  }
  const intentFields = [
    "wakeDistance",
    "homeLeash",
    "holdUntilWake",
    "retreatSeconds",
    "companionDistance",
    "isolationDistance",
    "burstSeconds",
    "pauseSeconds",
  ];
  for (const [intent, row] of Object.entries(b.intents)) {
    name(`intents.${intent}`, intent);
    closed(row, "pursuitScope" in row ? [...intentFields, "pursuitScope"] : intentFields);
    for (const f of intentFields) {
      if (f === "holdUntilWake") {
        if (typeof row[f] !== "boolean") fail("creatures", `behaviours.intents.${intent}.${f} must be true or false`);
      } else number("creatures", `behaviours.intents.${intent}.${f}`, row[f]);
    }
    if ("pursuitScope" in row && row.pursuitScope !== "area") fail("creatures", `behaviours.intents.${intent}.pursuitScope`);
  }
  for (const [table, rows] of [["recipeBehaviours", b.presets], ["recipeIntents", b.intents]])
    for (const [recipe, ref] of Object.entries(b[table])) {
      name(`${table}.${recipe}`, recipe);
      if (typeof ref !== "string" || !Object.hasOwn(rows, ref)) fail("creatures", `behaviours.${table}.${recipe} names an unknown row`);
    }
}
