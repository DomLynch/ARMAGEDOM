// The single game-data loader (Dom, 24 Oct 2026: everything possible lives in data). Every Web/src/data/*.json file is imported HERE
// and nowhere else (the as-data gate fails any other importer), validated, and frozen once at load. Engine code reads GAME_DATA.<name>.
// The sim needs these synchronously at module load, so they are bundled, not fetched. To add a file: put it in Web/src/data/, give it a
// `schema_version`, write its validator below, and list it in sources(). Per-area content stays in Web/public/world/.
import appearance from "../data/appearance.json" with { type: "json" };
import audio from "../data/audio.json" with { type: "json" };
import areaRuntime from "../data/areaRuntime.json" with { type: "json" };
import areas from "../data/areas.json" with { type: "json" };
import atmosphere from "../data/atmosphere.json" with { type: "json" };
import combatRules from "../data/combatRules.json" with { type: "json" };
import creatureDefinitions from "../data/creatureDefinitions.json" with { type: "json" };
import commander from "../data/commander.json" with { type: "json" };
import creatures from "../data/creatures.json" with { type: "json" };
import diagnostics from "../data/diagnostics.json" with { type: "json" };
import knifePaths from "../data/knifePaths.json" with { type: "json" };
import locker from "../data/locker.json" with { type: "json" };
import renderBudget from "../data/renderBudget.json" with { type: "json" };
import saveClient from "../data/saveClient.json" with { type: "json" };
import uniqueReward from "../data/uniqueReward.json" with { type: "json" };
import visual from "../data/visual.json" with { type: "json" };
import weapons from "../data/weapons.json" with { type: "json" };
import spawns from "../data/spawns.json" with { type: "json" };
import supplies from "../data/supplies.json" with { type: "json" };
import world from "../data/world.json" with { type: "json" };
import worldEvents from "../data/worldEvents.json" with { type: "json" };
import { closed, freeze } from "./content-schema.js";
import { appearanceExtraKeys, validateAppearanceExtras } from "./appearance-extra-validators.js";

export const SUPPORTED_SCHEMA_VERSION = 1;
const fail = (file, why) => {
  throw TypeError(`Invalid game data ${file}: ${why}`);
};
const count = (file, field, value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail(file, `${field} must be an integer from ${min} to ${max}`);
};

// combatRules.json: the numbers combat.js used to carry inline (Dom's rule: no tuning values in code). `legacy` is the original
// non-pilot goblin game: four enemy kinds (index = kind) and the shared swing, projectile, formation and loot numbers. Seconds, metres,
// degrees; `moveSpeed` is metres per second.
const legacyKind = ["hp", "radius", "damage", "swingRadius", "swingArc", "windupSeconds", "recoverSeconds", "readySeconds", "moveSpeed"];
export function validateCombatRules(d) {
  closed(d, [
    "schema_version",
    "hitFlashSeconds",
    "player",
    "startingPistol",
    "bodyRadius",
    "safehouseBodyPadding",
    "aim",
    "movement",
    "awareness",
    "spawning",
    "enemyAI",
    "reactions",
    "legacy",
  ]);
  number("combatRules", "hitFlashSeconds", d.hitFlashSeconds, 0.01);
  number("combatRules", "bodyRadius", d.bodyRadius, 0.01);
  number("combatRules", "safehouseBodyPadding", d.safehouseBodyPadding, 0);
  const flat = (name, fields) => {
    closed(d[name], fields);
    for (const f of fields) number("combatRules", `${name}.${f}`, d[name][f], 0);
  };
  flat("aim", ["targetConeDegrees", "mobSizeReachFactor"]);
  if (d.aim.targetConeDegrees >= 90) fail("combatRules", "aim.targetConeDegrees must be below 90");
  flat("movement", ["sidestepFraction", "patrolArrive", "patrolMove", "returnArrive", "homeLeash"]);
  flat("awareness", ["ratContactDistance", "sightDistance"]);
  flat("enemyAI", [
    "goblinSpeedFactor",
    "attackSpacing",
    "knifeAimDot",
    "animalBiteAimDot",
    "animalBiteReach",
    "animalContactReach",
    "ratMoveSpeed",
    "ratLowFootHeight",
  ]);
  for (const f of ["knifeAimDot", "animalBiteAimDot"])
    if (d.enemyAI[f] >= 1) fail("combatRules", `enemyAI.${f} must be below 1`);
  closed(d.player, ["radius", "damage", "spawn"]);
  for (const f of ["radius", "damage"]) number("combatRules", `player.${f}`, d.player[f], 0.01);
  closed(d.player.spawn, ["x", "z"]);
  closed(d.startingPistol, ["x", "z"]);
  for (const point of [d.player.spawn, d.startingPistol])
    for (const f of ["x", "z"]) if (!Number.isFinite(point[f])) fail("combatRules", "spawn and pistol positions must be finite");
  closed(d.spawning, ["distances", "laterals", "clearance"]);
  number("combatRules", "spawning.clearance", d.spawning.clearance, 0);
  for (const f of ["distances", "laterals"])
    if (!Array.isArray(d.spawning[f]) || !d.spawning[f].length || !d.spawning[f].every(Number.isFinite))
      fail("combatRules", `spawning.${f} must list finite numbers`);
  closed(d.reactions, ["blockImpactTicks", "defaultStaggerSeconds", "swingAssistTicks", "droneDeath", "breathStartTicks"]);
  for (const f of ["blockImpactTicks", "swingAssistTicks", "breathStartTicks"])
    count("combatRules", `reactions.${f}`, d.reactions[f], 1, 600);
  number("combatRules", "reactions.defaultStaggerSeconds", d.reactions.defaultStaggerSeconds, 0.01);
  closed(d.reactions.droneDeath, ["clip", "ticks"]);
  if (typeof d.reactions.droneDeath.clip !== "string" || !d.reactions.droneDeath.clip) fail("combatRules", "reactions.droneDeath.clip");
  count("combatRules", "reactions.droneDeath.ticks", d.reactions.droneDeath.ticks, 1, 600);
  const l = d.legacy;
  closed(l.player, [
    "bufferSeconds",
    "guardRecoverSeconds",
    "dodge",
    "walkSpeed",
    "guardMoveScale",
    "accelerate",
    "decelerate",
    "turnRate",
    "guard",
  ]);
  for (const f of ["bufferSeconds", "guardRecoverSeconds", "walkSpeed", "guardMoveScale", "accelerate", "decelerate", "turnRate"])
    number("combatRules", `legacy.player.${f}`, l.player[f], 0.001);
  closed(l.player.dodge, ["seconds", "invulnerableSeconds", "cooldownSeconds", "speed"]);
  for (const [f, v] of Object.entries(l.player.dodge)) number("combatRules", `legacy.player.dodge.${f}`, v, 0.001);
  closed(l.player.guard, ["arc", "parryWindowSeconds", "regenPerSecond", "blockedDamageFactor", "brokenSeconds", "parryStunSeconds"]);
  for (const [f, v] of Object.entries(l.player.guard)) number("combatRules", `legacy.player.guard.${f}`, v, 0);
  number("combatRules", "legacy.waveClearHeal", l.waveClearHeal, 0);
  number("combatRules", "legacy.hitKnockback", l.hitKnockback, 0);
  closed(l, [
    "player",
    "waveClearHeal",
    "hitKnockback",
    "kinds",
    "wideSwing",
    "alertDistance",
    "rangedReach",
    "reachSlack",
    "aimDot",
    "swingSeconds",
    "boltSpeed",
    "boltHitRadius",
    "formation",
    "loot",
  ]);
  if (!Array.isArray(l.kinds) || l.kinds.length !== 4) fail("combatRules", "legacy.kinds must list the four enemy kinds");
  l.kinds.forEach((row, i) => {
    closed(row, legacyKind);
    for (const f of legacyKind) number("combatRules", `legacy.kinds[${i}].${f}`, row[f], f === "hp" || f.endsWith("Seconds") ? 0.01 : 0);
  });
  closed(l.wideSwing, ["radius", "arc"]);
  number("combatRules", "legacy.wideSwing.radius", l.wideSwing.radius, 0.01);
  number("combatRules", "legacy.wideSwing.arc", l.wideSwing.arc, 1);
  for (const f of ["alertDistance", "rangedReach", "reachSlack", "swingSeconds", "boltSpeed", "boltHitRadius"])
    number("combatRules", `legacy.${f}`, l[f], 0.001);
  number("combatRules", "legacy.aimDot", l.aimDot, 0);
  if (l.aimDot >= 1) fail("combatRules", "legacy.aimDot must be below 1");
  closed(l.formation, ["columns", "xSpacing", "zSpacing"]);
  count("combatRules", "legacy.formation.columns", l.formation.columns, 1, 20);
  number("combatRules", "legacy.formation.xSpacing", l.formation.xSpacing, 0);
  number("combatRules", "legacy.formation.zSpacing", l.formation.zSpacing, 0);
  closed(l.loot, ["pickupRadius", "blade", "armour", "tonic"]);
  number("combatRules", "legacy.loot.pickupRadius", l.loot.pickupRadius, 0.01);
  for (const kind of ["blade", "armour", "tonic"]) {
    closed(l.loot[kind], ["base", "step"]);
    number("combatRules", `legacy.loot.${kind}.base`, l.loot[kind].base, 0);
    number("combatRules", `legacy.loot.${kind}.step`, l.loot[kind].step, 0);
  }
}

// creatureDefinitions.json: the creature foundations (one row per rig: clips, scale, stats, behaviour), the recipe -> foundation map and
// the native animal roles. engine/creature-catalogue.js validates every row in depth when it builds the catalogue; the loader checks
// the shape of the three parts.
export function validateCreatureDefinitions(d) {
  closed(d, ["schema_version", "definitions", "recipeFoundations", "nativeRoles"]);
  if (
    !Array.isArray(d.definitions) ||
    !d.definitions.length ||
    !d.definitions.every((r) => typeof r?.id === "string" && r.id)
  )
    fail("creatureDefinitions", "definitions must be a list of rows with an id");
  if (new Set(d.definitions.map((r) => r.id)).size !== d.definitions.length)
    fail("creatureDefinitions", "definition ids must be distinct");
  if (!d.recipeFoundations || typeof d.recipeFoundations !== "object" || Array.isArray(d.recipeFoundations))
    fail("creatureDefinitions", "recipeFoundations must be an object");
  for (const [recipe, foundation] of Object.entries(d.recipeFoundations))
    if (!d.definitions.some((r) => r.id === foundation))
      fail("creatureDefinitions", `recipeFoundations.${recipe} names an unknown foundation`);
  if (!Array.isArray(d.nativeRoles)) fail("creatureDefinitions", "nativeRoles must be a list");
  for (const role of d.nativeRoles) {
    closed(role, ["area", "placement", "recipe", "foundation", "cycles", "preset"]);
    for (const f of ["area", "placement", "recipe", "foundation", "preset"])
      if (typeof role[f] !== "string" || !role[f]) fail("creatureDefinitions", `nativeRoles.${f}`);
    if (!Array.isArray(role.cycles) || !role.cycles.length || !role.cycles.every((c) => c === "A" || c === "B"))
      fail("creatureDefinitions", "nativeRoles.cycles must list A and/or B");
    if (!Object.hasOwn(d.recipeFoundations, role.recipe) || d.recipeFoundations[role.recipe] !== role.foundation)
      fail("creatureDefinitions", `nativeRoles ${role.placement} recipe does not belong to its foundation`);
  }
}

export function validateDiagnostics(d) {
  closed(d, ["schema_version", "statsFramesPerLine", "loadStallMs"]);
  count("diagnostics", "statsFramesPerLine", d.statsFramesPerLine, 1, 100000);
  // Enter shows "Retry loading" when no model has finished loading for this long (a stalled connection), instead of waiting forever.
  count("diagnostics", "loadStallMs", d.loadStallMs, 5000, 600000);
}

// The locker's per-resource carry/stash caps (engine/locker-state.js). The resource list is the saved locker shape and stays in code;
// the loader checks the keys and the numbers. flame-fuel is the one fractional resource, the rest are whole counts.
export function validateLocker(d) {
  closed(d, ["schema_version", "resourceCaps"]);
  closed(d.resourceCaps, [
    "railgun-reserve",
    "pistol-reserve",
    "rifle-reserve",
    "shotgun-reserve",
    "rocket-reserve",
    "grenade-charges",
    "flame-fuel",
  ]);
  for (const [key, cap] of Object.entries(d.resourceCaps))
    if (!Number.isFinite(cap) || cap <= 0 || cap > 100000 || (key !== "flame-fuel" && !Number.isSafeInteger(cap)))
      fail("locker", `resourceCaps.${key}`);
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
  closed(d, [
    "schema_version",
    "minSaveIntervalMs",
    "staleSeqRetries",
    "characterName",
    "bootSyncWaitMs",
    "bucketBurst",
    "bucketRefillMs",
    "bucketReserve",
  ]);
  // The client's copy of the writer's per-account save bucket (server/writer DEFAULT_LIMITS save_run: burst, one token per refill; every
  // request costs one, a stale-seq retry too). A routine save never spends the last `bucketReserve` tokens: only a death save and the
  // page-hide send may, so a long fight can never leave the death save refused. Keep these equal to the writer's numbers.
  count("saveClient", "bucketBurst", d.bucketBurst, 1, 100);
  count("saveClient", "bucketRefillMs", d.bucketRefillMs, 100, 600000);
  count("saveClient", "bucketReserve", d.bucketReserve, 0, 50);
  if (d.bucketReserve >= d.bucketBurst) fail("saveClient", "bucketReserve must be below bucketBurst");
  count("saveClient", "bootSyncWaitMs", d.bootSyncWaitMs, 0, 15000); // how long Enter waits for the server record at most
  count("saveClient", "minSaveIntervalMs", d.minSaveIntervalMs, 1000, 600000); // the writer's bucket refills one save per 5 s
  count("saveClient", "staleSeqRetries", d.staleSeqRetries, 0, 5);
  if (typeof d.characterName !== "string" || !/^[\w -]{1,24}$/.test(d.characterName))
    fail("saveClient", "characterName");
}

// weapons.json holds the ranged catalogue. Its per-row rules are enforced by validateRangedWeaponCatalog (engine/weapon-catalog.js),
// which runs on this data when that module loads; the loader checks the shape.
export function validateWeapons(d) {
  closed(d, [
    "schema_version",
    "autoEquipOnFirstPickup",
    "autoPickupRetry",
    "ranged",
    "knife",
    "melee",
    "bossRanged",
    "bossEquipment",
    "vest",
    "families",
    "targeting",
    "mobileAim",
    "flameAim",
    "lowMelee",
    "creditPolicies",
    "audio",
  ]);
  if (typeof d.autoEquipOnFirstPickup !== "boolean") fail("weapons", "autoEquipOnFirstPickup must be true or false");
  // run-views.js createAutoPickup: a floor pickup whose claim did not take is tried again after `firstSeconds`, the wait doubling up to
  // `maxSeconds` (game time), while the player stays in reach.
  closed(d.autoPickupRetry, ["firstSeconds", "maxSeconds"]);
  number("weapons", "autoPickupRetry.firstSeconds", d.autoPickupRetry.firstSeconds, 0.1);
  number("weapons", "autoPickupRetry.maxSeconds", d.autoPickupRetry.maxSeconds, d.autoPickupRetry.firstSeconds);
  if (d.autoPickupRetry.maxSeconds > 60) fail("weapons", "autoPickupRetry.maxSeconds must be at most 60");
  if (!d.ranged || typeof d.ranged !== "object" || Array.isArray(d.ranged)) fail("weapons", "ranged must be an object");
  validateBossEquipment(d.bossEquipment, d.ranged);
  validateKnife(d.knife);
  validateMelee(d.melee);
  validateBossRanged(d.bossRanged);
  validateVest(d.vest);
  validateFamilies(d.families);
  validateTargeting(d.targeting);
  validateMobileAim(d.mobileAim, d.flameAim);
  validateLowMelee(d.lowMelee);
  validateCreditPolicies(d.creditPolicies);
  validateWeaponAudio(d.audio);
}
// The synthesised blast of the shotgun and the grenade (donor-audio.js): a sine sweep `from` -> `to` Hz over `seconds`, plus a noise
// burst through a low-pass at `cutoff` Hz; gains are 0 to 1.
export function validateWeaponAudio(a) {
  closed(a, ["shotgun", "grenade"]);
  for (const [weapon, cue] of Object.entries(a)) {
    closed(cue, ["from", "to", "seconds", "gain", "noiseSeconds", "noiseGain", "cutoff"]);
    for (const [f, v] of Object.entries(cue)) number("weapons", `audio.${weapon}.${f}`, v);
    for (const f of ["seconds", "noiseSeconds", "cutoff", "from", "to"])
      if (cue[f] <= 0) fail("weapons", `audio.${weapon}.${f} must be above 0`);
    for (const f of ["gain", "noiseGain"]) if (cue[f] > 1) fail("weapons", `audio.${weapon}.${f} must not exceed 1`);
  }
}
// The weapon family vocabulary (engine/weapon-catalog.js WEAPON_FAMILY_IDS). A family name is not a promise that the family is playable.
export function validateFamilies(f) {
  if (
    !Array.isArray(f) ||
    !f.length ||
    new Set(f).size !== f.length ||
    !f.every((s) => typeof s === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(s))
  )
    fail("weapons", "families must be distinct lower-case names");
}
// Aim assist cones in degrees (pistol-targeting.js): the pistol acquires inside the first cone and keeps its target inside the wider
// one; `meleeConeDegrees` is the default melee target cone. A cone must stay below 90.
export function validateTargeting(t) {
  closed(t, ["pistol", "meleeConeDegrees", "defaultHeight"]);
  // The metres above the ground that shots and flame aim at a rig with no height of its own (creatures.json rigCapabilities).
  number("weapons", "targeting.defaultHeight", t.defaultHeight);
  closed(t.pistol, ["acquireDegrees", "retainDegrees"]);
  for (const [f, v] of [...Object.entries(t.pistol), ["meleeConeDegrees", t.meleeConeDegrees]]) {
    number("weapons", `targeting.${f}`, v);
    if (v >= 90) fail("weapons", `targeting.${f} must be below 90`);
  }
  if (t.pistol.retainDegrees < t.pistol.acquireDegrees) fail("weapons", "targeting.pistol retain must not be below acquire");
}
// The touch aim assist (mobile-combat-aim.js) and the flame lock. Angles are degrees (the code converts to radians as `degrees * PI / 180`);
// rates are per second, ranges and gaps metres, gain and margins unitless.
export function validateMobileAim(m, f) {
  const mobile = ["steeringRate", "headingRate", "gain", "near", "far", "deadzone", "pistolGain", "acquireMargin", "retainMargin"],
    flame = ["gain", "closeExtension", "closeEnterGap", "closeExitGap", "extensionRate"],
    angles = ["steeringChangeDegrees", "switchConeDegrees", "switchAdvantageDegrees", "yawLimitDegrees", "downPitchDegrees"];
  closed(m, [...mobile, "acquireDegrees", "retainDegrees"]);
  closed(f, [...flame, "acquireDegrees", "retainDegrees", ...angles]);
  for (const k of [...mobile, "acquireDegrees", "retainDegrees"]) number("weapons", `mobileAim.${k}`, m[k]);
  for (const k of [...flame, "acquireDegrees", "retainDegrees", ...angles]) number("weapons", `flameAim.${k}`, f[k]);
  if (m.near >= m.far) fail("weapons", "mobileAim.near must be below far");
  if (m.pistolGain > 1) fail("weapons", "mobileAim.pistolGain must not exceed 1");
}
// The rigs and clips that share the rat's retimed low melee pose (rat-melee-definition.js).
export function validateLowMelee(l) {
  closed(l, ["rigs", "clips"]);
  for (const f of ["rigs", "clips"])
    if (!Array.isArray(l[f]) || !l[f].length || !l[f].every((s) => typeof s === "string" && s) || new Set(l[f]).size !== l[f].length)
      fail("weapons", `lowMelee.${f} must be a list of distinct non-empty strings`);
}
// The registered death-weapon attribution policies (engine/weapon-credit-policy.js): `mastery` credits proficiency, `none` does not.
export function validateCreditPolicies(rows) {
  if (!Array.isArray(rows) || !rows.length) fail("weapons", "creditPolicies must be a non-empty list");
  const seen = new Set();
  for (const row of rows) {
    closed(row, ["id", "creditPolicy"]);
    if (typeof row.id !== "string" || !row.id || seen.has(row.id)) fail("weapons", "creditPolicies ids must be distinct strings");
    seen.add(row.id);
    if (!["none", "mastery"].includes(row.creditPolicy)) fail("weapons", `creditPolicies.${row.id}.creditPolicy`);
  }
}
// The boss-reward weapons (engine/boss-equipment-data.js builds the profile table from this). `order` is the save-field order of all six;
// four are ranged catalogue rows named in `ranged`, the Bone Saw (surgicalKnife) and Ember Projector are listed here. Metres and seconds.
export function validateBossEquipment(b, ranged) {
  closed(b, ["order", "ranged", "boneSawRules", "surgicalKnife", "emberProjector"]);
  const text = (field, v) => {
    if (typeof v !== "string" || !v) fail("weapons", `bossEquipment.${field} must be a non-empty string`);
  };
  const names = [...Object.keys(b.ranged), "surgicalKnife", "emberProjector"];
  if (!Array.isArray(b.order) || b.order.length !== names.length || !names.every((n) => b.order.includes(n)))
    fail("weapons", "bossEquipment.order must list every reward field once");
  for (const [field, itemId] of Object.entries(b.ranged))
    if (!Object.hasOwn(ranged, itemId)) fail("weapons", `bossEquipment.ranged.${field} names an unknown weapon`);
  closed(b.boneSawRules, [
    "interval",
    "damage",
    "range",
    "coneDegrees",
    "moveScale",
    "staminaPerSecond",
    "staggerAfter",
    "staggerSeconds",
    "staggerRecovery",
  ]);
  for (const [f, v] of Object.entries(b.boneSawRules)) number("weapons", `bossEquipment.boneSawRules.${f}`, v);
  for (const field of ["surgicalKnife", "emberProjector"]) {
    const row = b[field],
      saw = field === "surgicalKnife";
    closed(row, [
      "itemId",
      "name",
      "family",
      "weaponKey",
      "delivery",
      "modelRef",
      "finisherBinding",
      saw ? "pickupRadius" : "rules",
      "source",
    ]);
    for (const f of ["itemId", "name", "family", "weaponKey", "delivery", "finisherBinding"])
      text(`${field}.${f}`, row[f]);
    if (row.modelRef !== null) text(`${field}.modelRef`, row.modelRef);
    if (saw) number("weapons", `bossEquipment.${field}.pickupRadius`, row.pickupRadius);
    else for (const [f, v] of Object.entries(row.rules)) number("weapons", `bossEquipment.${field}.rules.${f}`, v);
    closed(row.source, ["placementKey", "areaId", "receiptId"]);
    for (const f of Object.keys(row.source)) text(`${field}.source.${f}`, row.source[f]);
  }
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
  validateRigTables(d);
}

// creatures.json `feralBodyShapes`, `feralCoatProfiles`, `gauntShape` and `rigCapabilities` (feral-body-shapes.js, feral-coat-profiles.js,
// gaunt-shape.js, rig-capabilities.js). Recipe ids are unique; a rig capability is a closed set of boolean flags.
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
    "auth",
  ]);
  // Where the guest sign-in lives (engine/world-config.js). Both values are PUBLIC: the project URL and its publishable key. A legacy
  // anon JWT or any secret key fails the pattern, so a secret cannot be added here by accident.
  closed(d.auth, ["url", "anonKey"]);
  if (typeof d.auth.url !== "string" || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(d.auth.url)) fail("world", "auth.url");
  if (typeof d.auth.anonKey !== "string" || !/^sb_publishable_[A-Za-z0-9_-]{16,64}$/.test(d.auth.anonKey)) fail("world", "auth.anonKey");
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
  closed(d, ["schema_version", "survivorVariants", "faces", "clothing", "effects", "dropMarker", "routeArrow", "severBlood", "motion"]);
  // Sever blood presentation (engine/sever-blood-data.js): pool sizes are counts, times in seconds, lengths in metres.
  closed(d.severBlood, ["jet", "pool", "headDropletLifetime", "headDropletGravity"]);
  closed(d.severBlood.jet, ["capacity", "duration", "length", "radius"]);
  closed(d.severBlood.pool, ["settleSeconds", "capacity", "lifetime", "spreadSeconds", "radius", "opacity"]);
  count("visual", "severBlood.jet.capacity", d.severBlood.jet.capacity, 1, 64);
  count("visual", "severBlood.pool.capacity", d.severBlood.pool.capacity, 1, 64);
  for (const f of ["duration", "length", "radius"]) number("visual", `severBlood.jet.${f}`, d.severBlood.jet[f], 0.001);
  for (const f of ["settleSeconds", "lifetime", "spreadSeconds", "radius"])
    number("visual", `severBlood.pool.${f}`, d.severBlood.pool[f], 0.001);
  if (!(d.severBlood.pool.opacity > 0 && d.severBlood.pool.opacity <= 1)) fail("visual", "severBlood.pool.opacity must be above 0 and at most 1");
  number("visual", "severBlood.headDropletLifetime", d.severBlood.headDropletLifetime, 0.001);
  number("visual", "severBlood.headDropletGravity", d.severBlood.headDropletGravity, 0.001);
  // The in-world ground arrow (engine/route-guidance.js) takes the drop marker's ringColour, so the two read as one family; its own
  // peakOpacity is the top of its pulse (the pulse floor is the share ARROW_MIN_OPACITY of it).
  closed(d.routeArrow, ["peakOpacity"]);
  const peak = d.routeArrow.peakOpacity;
  if (typeof peak !== "number" || !(peak > 0 && peak <= 1)) fail("visual", "routeArrow.peakOpacity must be above 0 and at most 1");
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
  closed(d.effects, ["swingColours", "lootColours", "targetHeights"]);
  // effects.js aims its hit burst, kill confirmation, tracer end and target reticle at a height that depends on the target's rig. Per
  // site, a `default` row plus one row per rig: `fixed` metres, `drone` (the hovering drone's height), `cue` (the cue's own height) or
  // `scaled` metres times the rig's view scale; an empty row means "use the site's own fallback".
  closed(d.effects.targetHeights, ["burst", "confirm", "tracer", "reticle"]);
  for (const [site, rows] of Object.entries(d.effects.targetHeights)) {
    if (!Object.hasOwn(rows, "default")) fail("visual", `effects.targetHeights.${site} needs a default row`);
    for (const [rig, row] of Object.entries(rows)) {
      const where = `effects.targetHeights.${site}.${rig}`;
      if (!/^[a-z][a-z0-9-]{0,40}$/.test(rig) && rig !== "default") fail("visual", `${where} is not a rig id`);
      closed(row, [], ["fixed", "drone", "cue", "scaled"]);
      if (Object.keys(row).length > 1) fail("visual", `${where} must use one of fixed, drone, cue or scaled`);
      for (const k of ["fixed", "scaled"]) if (k in row) number("visual", `${where}.${k}`, row[k], 0.01);
      for (const k of ["drone", "cue"]) if (k in row && row[k] !== true) fail("visual", `${where}.${k} must be true`);
    }
  }
  closed(d.effects.swingColours, ["slash", "stab", "heavy", "special"]);
  for (const [name, h] of Object.entries(d.effects.swingColours)) hex(`effects.swingColours.${name}`, h);
  list("effects.lootColours", d.effects.lootColours, 1, 16);
  d.effects.lootColours.forEach((h) => hex("effects.lootColours", h));
  // The ground marker on every unclaimed weapon or reward drop (engine/drop-marker.js): a pulsing ring (metres), a short floating label
  // (width and height above the ground in metres) and a gentle pulse of the drop itself (a share of its size).
  const m = d.dropMarker;
  closed(m, [
    "shape",
    "bracketArm",
    "ringInner",
    "ringOuter",
    "glowOuter",
    "glowOpacity",
    "peakOpacity",
    "labelBackingOpacity",
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
  if (!["circle", "square", "brackets", "diamond"].includes(m.shape)) fail("visual", "dropMarker.shape must be circle, square, brackets or diamond");
  if (!(m.bracketArm >= 0.05 && m.bracketArm <= 0.5)) fail("visual", "dropMarker.bracketArm must be 0.05 to 0.5 of a side");
  if (m.ringOuter <= m.ringInner) fail("visual", "dropMarker.ringOuter must exceed ringInner");
  if (m.glowOuter <= m.ringOuter) fail("visual", "dropMarker.glowOuter must exceed ringOuter");
  for (const f of ["glowOpacity", "peakOpacity", "labelBackingOpacity", "ringPulse"])
    if (!(m[f] >= 0 && m[f] <= 1)) fail("visual", `dropMarker.${f} must be 0 to 1`);
  if (!(m.minOpacity >= 0 && m.minOpacity <= 1)) fail("visual", "dropMarker.minOpacity must be 0 to 1");
  if (!(m.itemPulse >= 0 && m.itemPulse <= 0.3)) fail("visual", "dropMarker.itemPulse must be 0 to 0.3");
}

// spawns.json: the resident and drone placements of the areas whose rows were code before the data layer (Westminster, East, South),
// and which of those residents walk with the crooked gait. The rest of the area-content rules (geometry, creature identity, health
// range, a boss or unique-reward row naming a placement) are checked where the rows are used (engine/area-content.js).
export function validateSpawns(d) {
  closed(d, ["schema_version", "maxResidentHealth", "mob", "drones", "crookedResidents"]);
  // maxResidentHealth: the most health a placement's `encounter` row may give a resident (area-mob-spawns.js residentEncounterHealth).
  count("spawns", "maxResidentHealth", d.maxResidentHealth, 1, 10000);
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
  closed(d, ["schema_version", "presets", "areas", "budgets", "bends", "variation"]);
  // variation: the per-anchor jitter of atmosphere-areas.js. Each { min, span } row is drawn as min + random * span from the anchor's seed,
  // in the order the rows are read there; smokePeriod is the seconds one smoke cycle lasts; wind is the sway for the East and other areas.
  closed(d.variation, [
    "size",
    "rise",
    "noiseOffsetSpan",
    "defaultSmokeColor",
    "tint",
    "fireHeight",
    "opacity",
    "smokePeriod",
    "smokeSpeed",
    "wind",
  ]);
  for (const name of ["size", "rise", "tint", "fireHeight", "opacity", "smokeSpeed"]) {
    closed(d.variation[name], ["min", "span"]);
    fraction(`variation.${name}.min`, d.variation[name].min, 0.1, 2);
    fraction(`variation.${name}.span`, d.variation[name].span, 0, 1);
  }
  fraction("variation.noiseOffsetSpan", d.variation.noiseOffsetSpan, 0.001, 1000);
  fraction("variation.smokePeriod", d.variation.smokePeriod, 0.1, 1000);
  if (!Array.isArray(d.variation.defaultSmokeColor) || d.variation.defaultSmokeColor.length !== 3)
    fail("atmosphere", "variation.defaultSmokeColor");
  d.variation.defaultSmokeColor.forEach((c, i) => fraction(`variation.defaultSmokeColor[${i}]`, c));
  closed(d.variation.wind, ["east", "other", "span"]);
  for (const f of ["east", "other", "span"]) fraction(`variation.wind.${f}`, d.variation.wind[f], 0, 4);
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

// appearance.json: the survivor face mesh constants (face-appearance.js), the two hollow garment material names (hollow-palette.js)
// and the rat/dog and roach appearance rows (animal-appearance.js, roach-appearance.js). Tints are linear multipliers, width is a
// body-width factor and patch the share of worn patches, as those modules apply them.
export function validateAppearance(d) {
  closed(d, ["schema_version", "faceMesh", ...appearanceExtraKeys(), "hollowGarments", "animals", "roaches", "crookedHollow", "droneSupport"]);
  const between = (field, v, min, max) => {
    if (!Number.isFinite(v) || v < min || v > max) fail("appearance", `${field} must be a number from ${min} to ${max}`);
  };
  const triple = (field, v, max) => {
    if (!Array.isArray(v) || v.length !== 3) fail("appearance", `${field} must list 3 numbers`);
    v.forEach((n, i) => between(`${field}[${i}]`, n, 0, max));
  };
  const named = (field, v) => {
    if (typeof v !== "string" || !v) fail("appearance", `${field} must be a non-empty string`);
  };
  closed(d.faceMesh, ["cheek", "headNames"]);
  triple("faceMesh.cheek", d.faceMesh.cheek, 1);
  if (!Array.isArray(d.faceMesh.headNames) || d.faceMesh.headNames.length !== 3 || new Set(d.faceMesh.headNames).size !== 3)
    fail("appearance", "faceMesh.headNames must list 3 different mesh names");
  d.faceMesh.headNames.forEach((n, i) => named(`faceMesh.headNames[${i}]`, n));
  validateAppearanceExtras(d, { fail, between, triple });
  closed(d.hollowGarments, ["jacket", "trousers"]);
  named("hollowGarments.jacket", d.hollowGarments.jacket);
  named("hollowGarments.trousers", d.hollowGarments.trousers);
  if (d.hollowGarments.jacket === d.hollowGarments.trousers) fail("appearance", "hollowGarments names must differ");
  const rows = (table, fields, tintField) => {
    const seen = new Set();
    if (!Array.isArray(d[table]) || !d[table].length || d[table].length > 64) fail("appearance", `${table} must list 1 to 64 rows`);
    for (const row of d[table]) {
      closed(row, fields);
      if (typeof row.id !== "string" || !/^[a-z0-9-]{1,32}$/.test(row.id) || seen.has(row.id)) fail("appearance", `${table} id ${row.id}`);
      seen.add(row.id);
      named(`${table}.${row.id}.name`, row.name);
      if ("foundation" in row) named(`${table}.${row.id}.foundation`, row.foundation); // animal-appearance.js checks it against its coat names
      between(`${table}.${row.id}.width`, row.width, 0.1, 3);
      between(`${table}.${row.id}.patch`, row.patch, 0, 1);
      triple(`${table}.${row.id}.${tintField}`, row[tintField], 100);
    }
  };
  rows("animals", ["id", "foundation", "name", "width", "tint", "patch"], "tint");
  rows("roaches", ["id", "name", "width", "shellTint", "patch"], "shellTint");
  // crooked-hollow.js: the bones its pose layer saves and restores. low-hover-drone.js: the watcher's presentation support row
  // (the hover height and radius stay in creatures.json drone; the body band is these offsets, scaled, around the hover height).
  const bones = d.crookedHollow.bones;
  if (!Array.isArray(bones) || !bones.length || bones.length > 64 || new Set(bones).size !== bones.length)
    fail("appearance", "crookedHollow.bones must list 1 to 64 different bone names");
  bones.forEach((n, i) => named(`crookedHollow.bones[${i}]`, n));
  const s = d.droneSupport;
  closed(s, ["id", "states", "bodyBandOffsets", "attackWarningSeconds", "deathSeconds", "finisher", "melee"]);
  for (const f of ["id", "finisher", "melee"]) named(`droneSupport.${f}`, s[f]);
  if (!Array.isArray(s.states) || !s.states.length || new Set(s.states).size !== s.states.length)
    fail("appearance", "droneSupport.states must list different state names");
  s.states.forEach((n, i) => named(`droneSupport.states[${i}]`, n));
  if (!Array.isArray(s.bodyBandOffsets) || s.bodyBandOffsets.length !== 2) fail("appearance", "droneSupport.bodyBandOffsets must list 2 numbers");
  s.bodyBandOffsets.forEach((n, i) => between(`droneSupport.bodyBandOffsets[${i}]`, n, -2, 2));
  if (s.bodyBandOffsets[0] >= s.bodyBandOffsets[1]) fail("appearance", "droneSupport.bodyBandOffsets must rise");
  between("droneSupport.attackWarningSeconds", s.attackWarningSeconds, 0.05, 10);
  between("droneSupport.deathSeconds", s.deathSeconds, 0.05, 10);
}

// areas.json: the registered areas (layout/backdrop/audio refs, entry point, exits) and the asset rows those refs name (path, sha256,
// bytes). createAreaRegistry (area-registry.js) does the deep checks (graph, refs, conditions); this only holds the shapes closed.
// tests/data-areas.test.js ties the asset rows to public/world/manifest.json so the two cannot drift.
export function validateAreas(d) {
  closed(d, ["schema_version", "areas", "assets"]);
  if (!Array.isArray(d.areas) || d.areas.length < 1 || d.areas.length > 64) fail("areas", "areas must list 1 to 64 rows");
  for (const row of d.areas) {
    closed(row, ["id", "visibility", "layoutRef", "backdropRef", "audioRef", "entry", "exits"]);
    closed(row.entry, ["x", "y"]);
    if (!Array.isArray(row.exits)) fail("areas", `${row.id} exits`);
    for (const exit of row.exits) closed(exit, ["id", "target", "condition", "entry"], ["requiresDefeat", "requiresVisited"]);
  }
  if (!d.assets || typeof d.assets !== "object" || Array.isArray(d.assets)) fail("areas", "assets");
  for (const [ref, asset] of Object.entries(d.assets)) {
    closed(asset, ["kind", "path", "sha256", "bytes"]);
    if (!/^[0-9a-f]{64}$/.test(asset.sha256)) fail("areas", `${ref}.sha256`);
    count("areas", `${ref}.bytes`, asset.bytes, 1, 100000000);
  }
}

// supplies.json: which Westminster roamers issue a supply drop and what it holds (supplies.js AREA1_SUPPLIES, null = none), and where the
// worn-vest bag lies (run-state.js VEST_BAG_POSITION). The keys are save keys (the supplies ledger lists them), so they never change.
export function validateSupplies(d) {
  closed(d, ["schema_version", "area1", "vestBagPosition", "rules", "gearItems"]);
  // rules: supplies.js SUPPLY_RULES (pickup radius in metres, reserve cap in rounds, heal share of max health). gearItems: the two
  // gear drop kinds in the order supplies.js reads them (index 0 is the pistol). Both are saved drop kinds, so the ids never change.
  closed(d.rules, ["pickupRadius", "reserveCap", "healFraction"]);
  number("supplies", "rules.pickupRadius", d.rules.pickupRadius, 0.1);
  count("supplies", "rules.reserveCap", d.rules.reserveCap, 1, 99);
  if (!(d.rules.healFraction > 0 && d.rules.healFraction <= 1)) fail("supplies", "rules.healFraction must be above 0 and at most 1");
  if (d.gearItems.join() !== "westminster-start-pistol-v1,westminster-worn-vest-v1")
    fail("supplies", "gearItems must be the start pistol then the worn vest");
  const keys = Object.keys(d.area1);
  if (keys.length !== 6 || keys.some((k, i) => k !== `westminster-roamer-${i + 1}`))
    fail("supplies", "area1 must list westminster-roamer-1 to 6 in order");
  for (const [key, rule] of Object.entries(d.area1)) {
    if (rule === null) continue;
    closed(rule, ["kind", "amount"]);
    if (!["rounds", "dressing"].includes(rule.kind)) fail("supplies", `${key}.kind must be rounds or dressing`);
    count("supplies", `${key}.amount`, rule.amount, 1, 12);
  }
  closed(d.vestBagPosition, ["x", "z"]);
  for (const axis of ["x", "z"]) number("supplies", `vestBagPosition.${axis}`, d.vestBagPosition[axis], -1000);
}

// areaRuntime.json: the light intensities an area gets when it names no preset (engine/area-lighting.js), the travel prefetch pacing
// (engine/area-prefetch.js) and the parked-area budget (engine/areas.js). Milliseconds, bytes and light intensities, nothing else.
export function validateAreaRuntime(d) {
  closed(d, ["schema_version", "defaultLighting", "prefetch", "parkedAreas", "travel", "view"]);
  // view: how world.js frames and budgets an area. MiB of backdrop textures, camera clip planes in metres, the portrait actor size in CSS
  // pixels, zoom boosts as factors, screen lifts as fractions of the painting, the follow step cap in seconds and the exit hint range in metres.
  closed(d.view, [
    "textureBudgetMiB",
    "textureBudgetMinMiB",
    "cameraNear",
    "cameraFar",
    "portraitActorPixels",
    "landscapeZoomBoost",
    "portraitZoomBoost",
    "portraitLift",
    "landscapeLift",
    "maxFollowSeconds",
    "exitHintMeters",
    "defaultCharacterScale",
  ]);
  // defaultCharacterScale: the hero scale for a layout that names none (presence-session.js draws the other players with it).
  number("areaRuntime", "view.defaultCharacterScale", d.view.defaultCharacterScale, 0.1);
  count("areaRuntime", "view.textureBudgetMiB", d.view.textureBudgetMiB, 1, 1024);
  count("areaRuntime", "view.textureBudgetMinMiB", d.view.textureBudgetMinMiB, 1, d.view.textureBudgetMiB);
  number("areaRuntime", "view.cameraNear", d.view.cameraNear, 0.001);
  if (!(d.view.cameraFar > d.view.cameraNear && d.view.cameraFar <= 10000)) fail("areaRuntime", "view.cameraFar must be above cameraNear, at most 10000");
  for (const f of ["portraitActorPixels", "landscapeZoomBoost", "portraitZoomBoost", "maxFollowSeconds", "exitHintMeters"])
    number("areaRuntime", `view.${f}`, d.view[f], 0.001);
  for (const f of ["portraitLift", "landscapeLift"]) number("areaRuntime", `view.${f}`, d.view[f], 0);
  // travel: the "Traveling to ..." message delay, how long a failure message shows, and the area preparation slices (engine/areas.js).
  closed(d.travel, ["messageDelayMs", "failureMessageSeconds", "preparation"]);
  count("areaRuntime", "travel.messageDelayMs", d.travel.messageDelayMs, 0, 10000);
  count("areaRuntime", "travel.failureMessageSeconds", d.travel.failureMessageSeconds, 1, 60);
  closed(d.travel.preparation, ["deadlineMs", "idleTimeoutMs", "urgentSliceMs", "ambientSliceMs", "idleEnoughMs", "holdMs"]);
  for (const [name, v] of Object.entries(d.travel.preparation)) count("areaRuntime", `travel.preparation.${name}`, v, 1, 5000);
  closed(d.defaultLighting, ["fillIntensity", "keyIntensity"]);
  for (const [name, v] of Object.entries(d.defaultLighting))
    if (!Number.isFinite(v) || v < 0 || v > 4) fail("areaRuntime", `defaultLighting.${name} must be 0 to 4`);
  closed(d.prefetch, ["bytesPerSecond", "startDelayMs", "maxNeighbours", "recheckMs", "fightQuietMs"]);
  count("areaRuntime", "prefetch.bytesPerSecond", d.prefetch.bytesPerSecond, 10000, 100000000);
  count("areaRuntime", "prefetch.startDelayMs", d.prefetch.startDelayMs, 0, 600000);
  count("areaRuntime", "prefetch.maxNeighbours", d.prefetch.maxNeighbours, 1, 8);
  count("areaRuntime", "prefetch.recheckMs", d.prefetch.recheckMs, 10, 60000);
  count("areaRuntime", "prefetch.fightQuietMs", d.prefetch.fightQuietMs, 0, 600000);
  closed(d.parkedAreas, ["maxAreas", "maxBytes"]);
  count("areaRuntime", "parkedAreas.maxAreas", d.parkedAreas.maxAreas, 1, 8);
  count("areaRuntime", "parkedAreas.maxBytes", d.parkedAreas.maxBytes, 1048576, 1073741824);
}

// uniqueReward.json: where a boss's drop is placed when its corpse is against a wall or exit (engine/unique-reward-runtime.js). Metres,
// searched outward in 16 directions: the near rings first, then the wider ones. Placement only; item identity and saved shape stay in code.
export function validateUniqueReward(d) {
  closed(d, ["schema_version", "dropSearch"]);
  closed(d.dropSearch, ["nearRadii", "fallbackRadii"]);
  for (const name of ["nearRadii", "fallbackRadii"]) {
    const rows = d.dropSearch[name];
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 16) fail("uniqueReward", `dropSearch.${name} must list 1 to 16 radii`);
    rows.forEach((r, i) => {
      if (!Number.isFinite(r) || r <= 0 || r > 20 || (i > 0 && r <= rows[i - 1]))
        fail("uniqueReward", `dropSearch.${name} must be increasing radii above 0 and up to 20 m`);
    });
  }
}

// knifePaths.json: the baked blade paths of the donor knife (donor/knife.js bladePose, engine/melee-equipment-data.js). For the hero and the
// goblin rig, four unchained swings; each is a list of frames, a frame is the blade's base and tip as x, y, z, x, y, z in metres in the
// rig's local space. Baked from the donor (provenance in donor/provenance.json), never hand-edited: only the shape is checked here.
export function validateKnifePaths(d) {
  closed(d, ["schema_version", "paths"]);
  closed(d.paths, ["hero", "goblin"]);
  const frames = { light_right: 37, light_left: 37, heavy_overhead: 54, thrust: 37 };
  for (const rig of ["hero", "goblin"]) {
    closed(d.paths[rig], Object.keys(frames));
    for (const [name, length] of Object.entries(frames)) {
      const rows = d.paths[rig][name];
      if (!Array.isArray(rows) || rows.length !== length) fail("knifePaths", `${rig}.${name} must list ${length} frames`);
      rows.forEach((frame, i) => {
        if (!Array.isArray(frame) || frame.length !== 6 || frame.some((v) => !Number.isFinite(v)))
          fail("knifePaths", `${rig}.${name}[${i}] must be six finite numbers`);
      });
    }
  }
}

// audio.json: the synthesized combat cues and the voice engine of donor-audio.js. Frequencies in Hz, times in seconds, gains 0 to 1.
// A tone row is { from, to, seconds, gain, type? } (type defaults to triangle in donor-audio.js); a noise row is { seconds, gain, cutoff }.
export function validateAudio(d) {
  const gain = (field, v) => {
    if (!Number.isFinite(v) || v <= 0 || v > 1) fail("audio", `${field} must be above 0 and at most 1`);
  };
  const tone = (field, row, extra = []) => {
    closed(row, ["from", "to", "seconds", "gain", ...extra], ["type"]);
    number("audio", `${field}.from`, row.from, 1);
    number("audio", `${field}.to`, row.to, 1);
    number("audio", `${field}.seconds`, row.seconds, 0.001);
    gain(`${field}.gain`, row.gain);
    if ("type" in row && !["sine", "triangle", "sawtooth"].includes(row.type)) fail("audio", `${field}.type`);
  };
  const noise = (field, row) => {
    closed(row, ["seconds", "gain", "cutoff"]);
    number("audio", `${field}.seconds`, row.seconds, 0.001);
    gain(`${field}.gain`, row.gain);
    number("audio", `${field}.cutoff`, row.cutoff, 1);
  };
  closed(d, [
    "schema_version",
    "engine",
    "saw",
    "railgunHum",
    "cueGains",
    "hit",
    "railgunShot",
    "shot",
    "rocketLaunch",
    "grenadeOff",
    "pickup",
  ]);
  closed(d.engine, [
    "voiceCapacity",
    "outputGain",
    "floorGain",
    "attackSeconds",
    "stopPadSeconds",
    "lowModeFactor",
    "noiseBufferSeconds",
  ]);
  count("audio", "engine.voiceCapacity", d.engine.voiceCapacity, 1, 64);
  for (const f of ["outputGain", "floorGain", "lowModeFactor"]) gain(`engine.${f}`, d.engine[f]);
  for (const f of ["attackSeconds", "stopPadSeconds", "noiseBufferSeconds"]) number("audio", `engine.${f}`, d.engine[f], 0.0001);
  closed(d.saw, ["frequency", "gain", "gainOff"]);
  number("audio", "saw.frequency", d.saw.frequency, 1);
  gain("saw.gain", d.saw.gain);
  gain("saw.gainOff", d.saw.gainOff);
  closed(d.railgunHum, ["gain", "fromHz", "toHz"]);
  gain("railgunHum.gain", d.railgunHum.gain);
  number("audio", "railgunHum.fromHz", d.railgunHum.fromHz, 1);
  number("audio", "railgunHum.toHz", d.railgunHum.toHz, 1);
  closed(d.cueGains, ["sever", "hit", "whooshHeavy", "whooshLight", "roll"]);
  for (const [name, v] of Object.entries(d.cueGains)) gain(`cueGains.${name}`, v);
  closed(d.hit, ["off", "lethal", "normal"]);
  closed(d.hit.off, ["lethal", "normal"]);
  tone("hit.off.lethal", d.hit.off.lethal);
  tone("hit.off.normal", d.hit.off.normal);
  closed(d.hit.lethal, ["tone", "noise", "ring"]);
  tone("hit.lethal.tone", d.hit.lethal.tone);
  noise("hit.lethal.noise", d.hit.lethal.noise);
  tone("hit.lethal.ring", d.hit.lethal.ring);
  closed(d.hit.normal, ["tone", "noise"]);
  tone("hit.normal.tone", d.hit.normal.tone);
  noise("hit.normal.noise", d.hit.normal.noise);
  closed(d.railgunShot, ["crack", "thump", "noise"]);
  tone("railgunShot.crack", d.railgunShot.crack);
  tone("railgunShot.thump", d.railgunShot.thump);
  noise("railgunShot.noise", d.railgunShot.noise);
  closed(d.shot, ["fallback", "off"]);
  tone("shot.fallback", d.shot.fallback, ["noiseSeconds", "noiseGain", "cutoff"]);
  number("audio", "shot.fallback.noiseSeconds", d.shot.fallback.noiseSeconds, 0.001);
  gain("shot.fallback.noiseGain", d.shot.fallback.noiseGain);
  number("audio", "shot.fallback.cutoff", d.shot.fallback.cutoff, 1);
  tone("shot.off", d.shot.off);
  closed(d.rocketLaunch, ["tone", "noise"]);
  tone("rocketLaunch.tone", d.rocketLaunch.tone);
  noise("rocketLaunch.noise", d.rocketLaunch.noise);
  closed(d.grenadeOff, ["seconds", "gain"]);
  number("audio", "grenadeOff.seconds", d.grenadeOff.seconds, 0.001);
  gain("grenadeOff.gain", d.grenadeOff.gain);
  tone("pickup", d.pickup);
}

// commander.json: the Commander mode match rules (engine/commander/match.js COMMANDER_RULES) that are not borrowed from the drone rules.
// Counts are whole numbers, times in seconds, distances in metres. The drone-derived values (machine radius, damage, windup,
// recovery, bolt speed) stay computed from creatures.json `drone` in match.js.
export function validateCommander(d) {
  const counts = ["unitCap", "reserve", "deployCost", "machineHP", "biologicalHP", "biologicalDamage", "beaconHP"];
  closed(d, ["schema_version", "rules"]);
  closed(d.rules, [
    ...counts,
    "machineSpeed",
    "range",
    "biologicalSpeed",
    "meleeRange",
    "meleeWindup",
    "meleeRecovery",
    "captureRadius",
    "captureSeconds",
    "defendSeconds",
    "matchSeconds",
  ]);
  for (const [name, v] of Object.entries(d.rules))
    if (counts.includes(name)) count("commander", `rules.${name}`, v, 1, 10000);
    else number("commander", `rules.${name}`, v, 0.001);
}

// name -> [raw json, validator]. A function, not a table, so the loader itself adds nothing to the constant-table baseline.
const sources = () => ({
  knifePaths: [knifePaths, validateKnifePaths],
  audio: [audio, validateAudio],
  commander: [commander, validateCommander],
  appearance: [appearance, validateAppearance],
  atmosphere: [atmosphere, validateAtmosphere],
  areaRuntime: [areaRuntime, validateAreaRuntime],
  areas: [areas, validateAreas],
  combatRules: [combatRules, validateCombatRules],
  creatures: [creatures, validateCreatures],
  creatureDefinitions: [creatureDefinitions, validateCreatureDefinitions],
  diagnostics: [diagnostics, validateDiagnostics],
  locker: [locker, validateLocker],
  renderBudget: [renderBudget, validateRenderBudget],
  saveClient: [saveClient, validateSaveClient],
  spawns: [spawns, validateSpawns],
  supplies: [supplies, validateSupplies],
  uniqueReward: [uniqueReward, validateUniqueReward],
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
