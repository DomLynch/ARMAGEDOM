// weapons.json validators, split out of game-data.js (which re-exports them) to keep the loader small. Same checks, same messages.
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

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
  closed(t, ["pistol", "meleeConeDegrees", "defaultHeight", "shot"]);
  // The metres above the ground that shots and flame aim at a rig with no height of its own (creatures.json rigCapabilities).
  number("weapons", "targeting.defaultHeight", t.defaultHeight);
  // How a shot is resolved (pistol-targeting.js), metres: the height a shot that hits nothing ends at, the throw range a grenade falls
  // back to when no range was set, the heights a grenade and any other projectile land at, and the body ellipsoid a ray is tested
  // against (half-height = max(minimum, target height x ratio)).
  closed(t.shot, [
    "missHeight",
    "grenadeFallbackRange",
    "grenadeLandingHeight",
    "landingHeight",
    "bodyMinHalfHeight",
    "bodyHeightRatio",
  ]);
  for (const [f, v] of Object.entries(t.shot)) number("weapons", `targeting.shot.${f}`, v, 0.001);
  closed(t.pistol, ["acquireDegrees", "retainDegrees"]);
  for (const [f, v] of [...Object.entries(t.pistol), ["meleeConeDegrees", t.meleeConeDegrees]]) {
    number("weapons", `targeting.${f}`, v);
    if (v >= 90) fail("weapons", `targeting.${f} must be below 90`);
  }
  if (t.pistol.retainDegrees < t.pistol.acquireDegrees)
    fail("weapons", "targeting.pistol retain must not be below acquire");
}
// The touch aim assist (mobile-combat-aim.js) and the flame lock. Angles are degrees (the code converts to radians as `degrees * PI / 180`);
// rates are per second, ranges and gaps metres, gain and margins unitless.
export function validateMobileAim(m, f) {
  const mobile = [
      "steeringRate",
      "headingRate",
      "gain",
      "near",
      "far",
      "deadzone",
      "pistolGain",
      "acquireMargin",
      "retainMargin",
    ],
    flame = ["gain", "closeExtension", "closeEnterGap", "closeExitGap", "extensionRate"],
    angles = [
      "steeringChangeDegrees",
      "switchConeDegrees",
      "switchAdvantageDegrees",
      "yawLimitDegrees",
      "downPitchDegrees",
    ];
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
    if (
      !Array.isArray(l[f]) ||
      !l[f].length ||
      !l[f].every((s) => typeof s === "string" && s) ||
      new Set(l[f]).size !== l[f].length
    )
      fail("weapons", `lowMelee.${f} must be a list of distinct non-empty strings`);
}
// The registered death-weapon attribution policies (engine/weapon-credit-policy.js): `mastery` credits proficiency, `none` does not.
export function validateCreditPolicies(rows) {
  if (!Array.isArray(rows) || !rows.length) fail("weapons", "creditPolicies must be a non-empty list");
  const seen = new Set();
  for (const row of rows) {
    closed(row, ["id", "creditPolicy"]);
    if (typeof row.id !== "string" || !row.id || seen.has(row.id))
      fail("weapons", "creditPolicies ids must be distinct strings");
    seen.add(row.id);
    if (!["none", "mastery"].includes(row.creditPolicy)) fail("weapons", `creditPolicies.${row.id}.creditPolicy`);
  }
}
// The boss-reward weapons (engine/boss-equipment-data.js builds the profile table from this). `order` is the save-field order of all six;
// four are ranged catalogue rows named in `ranged`, the Bone Saw (surgicalKnife) and Ember Projector are listed here. Metres and seconds.
export function validateBossEquipment(b, ranged) {
  closed(b, ["order", "emberContactConeDegrees", "ranged", "boneSawRules", "surgicalKnife", "emberProjector"]);
  // The flame contact cone's full opening in degrees (the legacy pilot profile, engine/flame-fuel-state.js).
  if (!(b.emberContactConeDegrees > 0 && b.emberContactConeDegrees < 180))
    fail("weapons", "bossEquipment.emberContactConeDegrees must be above 0 and below 180");
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
// The donor knife: tuning rules, the five named moves, the stamina costs and the cooldowns. Moves are rows of named fields (ticks at 60 Hz).
export function validateKnife(k) {
  closed(k, ["rules", "moves", "staminaCosts", "cooldowns", "swingCurve", "bladeContact"]);
  // donor/knife.js: where a swing reaches contact (the default contact fraction of the clip and of the donor's source clip), how far
  // into the windup the curve bends (ratios of those), the follow-through gap, and the body capsule a swept blade is tested against
  // (bottom and top heights and radius, metres, scaled by the target's body scale; the sweep is sampled every stepMetres).
  closed(k.swingCurve, [
    "contact",
    "sourceContact",
    "windupContactRatio",
    "windupSourceRatio",
    "followContactGap",
    "followSourceRatio",
  ]);
  for (const [f, v] of Object.entries(k.swingCurve)) number("weapons", `knife.swingCurve.${f}`, v, 0.0001);
  closed(k.bladeContact, ["stepMetres", "bodyBottom", "bodyTop", "radius"]);
  for (const [f, v] of Object.entries(k.bladeContact)) number("weapons", `knife.bladeContact.${f}`, v, 0.0001);
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
