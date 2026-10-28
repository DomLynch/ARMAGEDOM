// The single game-data loader (Dom, 24 Oct 2026: everything possible lives in data). Every Web/src/data/*.json file is imported HERE
// and nowhere else (the as-data gate fails any other importer), validated, and frozen once at load. Engine code reads GAME_DATA.<name>.
// The sim needs these synchronously at module load, so they are bundled, not fetched. To add a file: put it in Web/src/data/, give it a
// `schema_version`, write its validator below, and list it in sources(). Per-area content stays in Web/public/world/.
import appearance from "../data/appearance.json" with { type: "json" };
import bossRangedExtra from "../data/bossRangedExtra.json" with { type: "json" };
import donorMotion from "../data/donorMotion.json" with { type: "json" };
import finisher from "../data/finisherData.json" with { type: "json" };
import audio from "../data/audio.json" with { type: "json" };
import browserSession from "../data/browserSession.json" with { type: "json" };
import areaRuntime from "../data/areaRuntime.json" with { type: "json" };
import areas from "../data/areas.json" with { type: "json" };
import atmosphere from "../data/atmosphere.json" with { type: "json" };
import combatRules from "../data/combatRules.json" with { type: "json" };
import creatureDefinitions from "../data/creatureDefinitions.json" with { type: "json" };
import commander from "../data/commander.json" with { type: "json" };
import commanderSession from "../data/commanderSession.json" with { type: "json" };
import runNotices from "../data/runNotices.json" with { type: "json" };
import worldPickups from "../data/worldPickups.json" with { type: "json" };
import killDrops from "../data/killDrops.json" with { type: "json" };
import webText from "../data/webText.json" with { type: "json" };
import sessionText from "../data/sessionText.json" with { type: "json" };
import combatText from "../data/combatText.json" with { type: "json" };
import weaponViewText from "../data/weaponViewText.json" with { type: "json" };
import safehouseText from "../data/safehouseText.json" with { type: "json" };
import airdrop from "../data/airdrop.json" with { type: "json" };
import chainedPitborn from "../data/chainedPitborn.json" with { type: "json" };
import ratKing from "../data/ratKing.json" with { type: "json" };
import markedHunterSpawn from "../data/markedHunterSpawn.json" with { type: "json" };
import reaperMotion from "../data/reaperMotion.json" with { type: "json" };
import creatures from "../data/creatures.json" with { type: "json" };
import diagnostics from "../data/diagnostics.json" with { type: "json" };
import guestAuth from "../data/guestAuth.json" with { type: "json" };
import knifePaths from "../data/knifePaths.json" with { type: "json" };
import locker from "../data/locker.json" with { type: "json" };
import goldenWeapons from "../data/goldenWeapons.json" with { type: "json" };
import presenceClient from "../data/presenceClient.json" with { type: "json" };
import progressionBase from "../data/progressionBase.json" with { type: "json" };
import remoteSurvivors from "../data/remoteSurvivors.json" with { type: "json" };
import renderBudget from "../data/renderBudget.json" with { type: "json" };
import railgunCoils from "../data/railgunCoils.json" with { type: "json" };
import saveClient from "../data/saveClient.json" with { type: "json" };
import uniqueReward from "../data/uniqueReward.json" with { type: "json" };
import visual from "../data/visual.json" with { type: "json" };
import weapons from "../data/weapons.json" with { type: "json" };
import spawns from "../data/spawns.json" with { type: "json" };
import supplies from "../data/supplies.json" with { type: "json" };
import world from "../data/world.json" with { type: "json" };
import trapCrates from "../data/trapCrates.json" with { type: "json" };
import { validateTrapCrates } from "./game-data-trap-crates.js";
import offscreenActors from "../data/offscreenActors.json" with { type: "json" };
import { validateOffscreenActors } from "./offscreen-actors.js";
import worldEvents from "../data/worldEvents.json" with { type: "json" };
import { closed, freeze } from "./content-schema.js";
import * as extra from "./appearance-extra-validators.js";
import { validateRouteGuidance } from "./route-guidance-schema.js";
import { validateTravelText, validateAreaNames } from "./text-template.js";
import { validateWorldEventRules } from "./world-events-schema.js";
import { count, fail, id, number } from "./game-data-checks.js";
import { validateArcGun } from "./game-data-arc-gun.js";
import { validateFinisherImpact } from "./game-data-finisher-impact.js";
import { validateBossRangedData } from "./game-data-boss-ranged.js";
import { validateBrowserSession } from "./game-data-browser-session.js";
import { validateCombatRules } from "./game-data-combat.js";
import { validateDiagnostics, validateRenderBudget, validateSaveClient } from "./game-data-client.js";
import { validateCommanderSession } from "./game-data-commander-session.js";
import { validateRunNotices } from "./game-data-run-notices.js";
import { validateGoldenWeapons } from "./game-data-golden.js";
import { validateWorldPickups } from "./game-data-world-pickups.js";
import { validateKillDrops } from "./game-data-kill-drops.js";
import { validateWebText } from "./game-data-web-text.js";
import { validateSessionText } from "./game-data-session-text.js";
import { validateCombatText } from "./game-data-combat-text.js";
import { validateWeaponViewText } from "./game-data-weapon-view-text.js";
import { checkSafehouseNameIds, validateSafehouseText } from "./game-data-safehouse-text.js";
import { validateAirdrop } from "./game-data-airdrop.js";
import {
  validateChainedPitborn,
  validateRatKing,
  validateMarkedHunterSpawn,
  validatePhysicsBody,
  validatePhysicsDeath,
  validateDeathPresentation,
  validateReaperMotion,
} from "./game-data-hunters.js";
import physicsBody from "../data/physicsBody.json" with { type: "json" };
import physicsDeath from "../data/physicsDeath.json" with { type: "json" };
import deathPresentation from "../data/deathPresentation.json" with { type: "json" };
import { validateInput, validateTouchTarget } from "./input-data.js";
import { validateFlameEffect } from "./flame-effect-data.js";
import burnPresentation from "../data/burnPresentation.json" with { type: "json" };
import { validateBurnPresentation } from "./burn-presentation-data.js";
import { validateHud } from "./hud-data.js";
import { validateCombatImpact } from "./combat-impact-data.js";
import { validateDropMarkerLayout } from "./drop-marker-data.js";
import { validateEffectsFeedback } from "./effects-data.js";
import { validateDonorMotionData } from "./game-data-donor-motion.js";
import { validateGuestAuth, validatePresenceClient } from "./game-data-presence.js";
import { validateProgressionBase } from "./game-data-progression.js";
import { validateRailgunCoils } from "./game-data-railgun-coils.js";
import { validateFinisherData } from "./finisher-data-validator.js";
import { validateCreatures } from "./game-data-creatures.js";
import {
  validateBossEquipment,
  validateBossRanged,
  validateCreditPolicies,
  validateFamilies,
  validateKnife,
  validateLowMelee,
  validateMelee,
  validateMobileAim,
  validateTargeting,
  validateVest,
  validateWeaponAudio,
  validateWeapons,
} from "./game-data-weapons.js";

// The combat, weapons and creatures validators live in game-data-*.js (this loader stays small); they are still exported from here.
// fillText is the game's one placeholder filler: it swaps each {name} in a data string, and files outside engine/ import it from here.
export { fillText } from "./game-data-combat-text.js";
export {
  validateBossEquipment,
  validateBossRanged,
  validateBrowserSession,
  validateCombatRules,
  validateCommanderSession,
  validateRunNotices,
  validateWebText,
  validateSessionText,
  validateMarkedHunterSpawn,
  validateReaperMotion,
  validateCreatures,
  validateCreditPolicies,
  validateDiagnostics,
  validateFamilies,
  validateGuestAuth,
  validateKnife,
  validateLowMelee,
  validateMelee,
  validateMobileAim,
  validatePresenceClient,
  validateProgressionBase,
  validateRenderBudget,
  validateSaveClient,
  validateTargeting,
  validateVest,
  validateWeaponAudio,
  validateWeapons,
};
export const SUPPORTED_SCHEMA_VERSION = 1;

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

// The locker's per-resource carry/stash caps (engine/locker-state.js). The resource list is the saved locker shape and stays in code;
// the loader checks the keys and the numbers. flame-fuel is the one fractional resource, the rest are whole counts.
export function validateLocker(d) {
  closed(d, ["schema_version", "savedEraWeaponIds", "weaponIds", "resourceCaps"]);
  // The saved weapon list is append-only: its order is the save shape (locker-core.js names the slots by index). savedEraWeaponIds is
  // the list as saves were first written (tests/data-locker-weapon-ids.test.js pins it to the save-era fixture); weaponIds must start
  // with exactly those ids in that order, so a reorder or removal fails at load and only new ids at the end pass.
  for (const [name, list] of [
    ["savedEraWeaponIds", d.savedEraWeaponIds],
    ["weaponIds", d.weaponIds],
  ]) {
    if (!Array.isArray(list) || new Set(list).size !== list.length)
      fail("locker", `${name} must be a list of unique ids`);
    for (const id of list) if (typeof id !== "string" || !/^[a-z0-9-]+-v\d+$/.test(id)) fail("locker", `${name} ${id}`);
  }
  if (d.savedEraWeaponIds.length < 10) fail("locker", "savedEraWeaponIds lost an id");
  if (d.savedEraWeaponIds.some((id, i) => d.weaponIds[i] !== id))
    fail("locker", "weaponIds must start with savedEraWeaponIds in order (append-only)");
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
  if (typeof d.auth.url !== "string" || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(d.auth.url))
    fail("world", "auth.url");
  if (typeof d.auth.anonKey !== "string" || !/^sb_publishable_[A-Za-z0-9_-]{16,64}$/.test(d.auth.anonKey))
    fail("world", "auth.anonKey");
  // The error beacon (engine/client-log.js): one batch at most every minIntervalMs, at most maxEvents rows in it.
  closed(d.clientLog, [
    "path",
    "kinds",
    "minIntervalMs",
    "maxEvents",
    "maxDistinct",
    "messageChars",
    "maxBodyBytes",
    "sessionIdChars",
  ]);
  count("world", "clientLog.sessionIdChars", d.clientLog.sessionIdChars, 8, 24); // the writer keeps at most 24 characters of the session id
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
  closed(d, [
    "schema_version",
    "survivorVariants",
    "faces",
    "clothing",
    "effects",
    "dropMarker",
    "arcGun",
    "finisherImpact",
    "bossView",
    "pickupModel",
    "bossEquipmentView",
    "routeGuidance",
    "travelText",
    "areaNames",
    "exitRings",
    "grenadeView",
    "input",
    "touchTarget",
    "expeditionHud",
    "remotePlayers",
    "tapFallback",
    "firstTimeHints",
    "waterEffect",
    "worldGeometry",
    "severBlood",
    "motion",
    "safehouseView",
    "wantedPoster",
    "weaponViews",
    "combatImpact",
    "flameEffect",
    "explosion",
    "weaponTiles",
    "bossLabel",
    "hud",
    "flamePresentation",
  ]);
  validateHud(d.hud);
  validateCombatImpact(d.combatImpact);
  validateFlameEffect(d.flameEffect);
  validateArcGun(d.arcGun);
  validateFinisherImpact(d.finisherImpact);
  // Sever blood presentation (engine/sever-blood-data.js): pool sizes are counts, times in seconds, lengths in metres.
  closed(d.severBlood, ["jet", "pool", "headDropletLifetime", "headDropletGravity"]);
  closed(d.severBlood.jet, ["capacity", "duration", "length", "radius"]);
  closed(d.severBlood.pool, ["settleSeconds", "capacity", "lifetime", "spreadSeconds", "radius", "opacity"]);
  count("visual", "severBlood.jet.capacity", d.severBlood.jet.capacity, 1, 64);
  count("visual", "severBlood.pool.capacity", d.severBlood.pool.capacity, 1, 64);
  for (const f of ["duration", "length", "radius"]) number("visual", `severBlood.jet.${f}`, d.severBlood.jet[f], 0.001);
  for (const f of ["settleSeconds", "lifetime", "spreadSeconds", "radius"])
    number("visual", `severBlood.pool.${f}`, d.severBlood.pool[f], 0.001);
  if (!(d.severBlood.pool.opacity > 0 && d.severBlood.pool.opacity <= 1))
    fail("visual", "severBlood.pool.opacity must be above 0 and at most 1");
  number("visual", "severBlood.headDropletLifetime", d.severBlood.headDropletLifetime, 0.001);
  number("visual", "severBlood.headDropletGravity", d.severBlood.headDropletGravity, 0.001);
  validateRouteGuidance(d.routeGuidance);
  validateTravelText(d.travelText);
  validateAreaNames(d.areaNames);
  validateInput(d.input);
  validateTouchTarget(d.touchTarget);
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
  closed(c, ["version", "minTonalGap", "tops", "trousers", "partners"]);
  if (typeof c.version !== "string" || !/^[a-z0-9-]{1,40}$/.test(c.version)) fail("visual", "clothing.version");
  extra.validateClothingGap(c, { fail });
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
  closed(d.effects, ["swingColours", "lootColours", "targetHeights", "feedback"]);
  validateEffectsFeedback(d.effects.feedback);
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
    "label",
    "glow",
    "ringY",
    "ringSegments",
  ]);
  validateDropMarkerLayout(m);
  for (const f of ["ringColour", "labelColour", "labelBacking"]) hex(`dropMarker.${f}`, m[f]);
  for (const f of ["ringInner", "ringOuter", "glowOuter", "pulseSeconds", "labelHeight", "labelWidth"])
    number("visual", `dropMarker.${f}`, m[f], 0.01);
  if (!["circle", "square", "brackets", "diamond"].includes(m.shape))
    fail("visual", "dropMarker.shape must be circle, square, brackets or diamond");
  if (!(m.bracketArm >= 0.05 && m.bracketArm <= 0.5))
    fail("visual", "dropMarker.bracketArm must be 0.05 to 0.5 of a side");
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
  closed(d, ["schema_version", "maxResidentHealth", "mob", "drones", "crookedResidents"], ["reservedPlacements"]);
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
  // reservedPlacements: keys a later release will spawn. They are registered with the save reader now (progression registry) and
  // spawn nothing, so a rollback to this release still reads saves that already name them. A key moves to its real row on that release.
  for (const [area, list] of Object.entries(d.reservedPlacements ?? {})) {
    if (!/^[a-z][a-z0-9-]*$/.test(area) || !Array.isArray(list) || new Set(list).size !== list.length)
      fail("spawns", `reservedPlacements.${area}`);
    if (list.some((key) => typeof key !== "string" || !/^[a-z][a-z0-9-]*$/.test(key) || keys.has(key)))
      fail("spawns", `reservedPlacements.${area} key`);
  }
}

// worldEvents.json: how the world-event journal reads the legacy run (engine/world-events.js). The legacy event types that become
// drop events, the legacy pickup event types with the field that names the item, and the persistence dispatchers it wraps.
// Client-side mapping only: the wire schema (event fields, codes, weapon ids) stays in code, the server trusts it.
export function validateWorldEvents(d) {
  closed(d, ["schema_version", "legacyDropEvents", "legacyPickupEvents", "rules", "dispatchers"]);
  validateWorldEventRules(d.rules);
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
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    fail("atmosphere", `${field} must be ${min} to ${max}`);
};
const ATMOSPHERE_ROW_MAX = 16; // tuning-ok: validator ceiling for an atmosphere row's numbers
const atmosphereRow = (field, row, allowSmokeColor = true) => {
  for (const key of atmosphereNumbers())
    if (Object.hasOwn(row, key)) fraction(`${field}.${key}`, row[key], 0, ATMOSPHERE_ROW_MAX);
  if (Object.hasOwn(row, "smokeColor")) {
    if (!allowSmokeColor || !Array.isArray(row.smokeColor) || row.smokeColor.length !== 3)
      fail("atmosphere", `${field}.smokeColor`);
    row.smokeColor.forEach((c, i) => fraction(`${field}.smokeColor[${i}]`, c));
  }
};
export function validateAtmosphere(d) {
  closed(d, ["schema_version", "presets", "areas", "budgets", "bends", "variation", "render"]);
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
      id("atmosphere", `${area} anchor id`, row.id); // text-ok: validator field label, never shown to a player
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
    if (!Array.isArray(chain) || chain.length < 2 || chain.length > 32)
      fail("atmosphere", `bends.${area} must list 2 to 32 points`);
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
  closed(d, [
    "schema_version",
    "faceMesh",
    ...extra.appearanceExtraKeys(),
    "hollowGarments",
    "animals",
    "roaches",
    "crookedHollow",
    "droneSupport",
  ]);
  const between = (field, v, min, max) => {
    if (!Number.isFinite(v) || v < min || v > max)
      fail("appearance", `${field} must be a number from ${min} to ${max}`);
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
  if (
    !Array.isArray(d.faceMesh.headNames) ||
    d.faceMesh.headNames.length !== 3 ||
    new Set(d.faceMesh.headNames).size !== 3
  )
    fail("appearance", "faceMesh.headNames must list 3 different mesh names");
  d.faceMesh.headNames.forEach((n, i) => named(`faceMesh.headNames[${i}]`, n));
  extra.validateAppearanceExtras(d, { fail, between, triple });
  closed(d.hollowGarments, ["jacket", "trousers"]);
  named("hollowGarments.jacket", d.hollowGarments.jacket);
  named("hollowGarments.trousers", d.hollowGarments.trousers);
  if (d.hollowGarments.jacket === d.hollowGarments.trousers) fail("appearance", "hollowGarments names must differ");
  const rows = (table, fields, tintField) => {
    const seen = new Set();
    if (!Array.isArray(d[table]) || !d[table].length || d[table].length > 64)
      fail("appearance", `${table} must list 1 to 64 rows`);
    for (const row of d[table]) {
      closed(row, fields);
      if (typeof row.id !== "string" || !/^[a-z0-9-]{1,32}$/.test(row.id) || seen.has(row.id))
        fail("appearance", `${table} id ${row.id}`);
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
  if (!Array.isArray(s.bodyBandOffsets) || s.bodyBandOffsets.length !== 2)
    fail("appearance", "droneSupport.bodyBandOffsets must list 2 numbers");
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
  if (!Array.isArray(d.areas) || d.areas.length < 1 || d.areas.length > 64)
    fail("areas", "areas must list 1 to 64 rows");
  for (const row of d.areas) {
    closed(row, ["id", "visibility", "layoutRef", "backdropRef", "audioRef", "entry", "exits"]);
    closed(row.entry, ["x", "y"]);
    if (!Array.isArray(row.exits)) fail("areas", `${row.id} exits`);
    for (const exit of row.exits)
      closed(exit, ["id", "target", "condition", "entry"], ["requiresDefeat", "requiresVisited"]);
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
  if (!(d.rules.healFraction > 0 && d.rules.healFraction <= 1))
    fail("supplies", "rules.healFraction must be above 0 and at most 1");
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
  closed(d, ["schema_version", "defaultLighting", "prefetch", "parkedAreas", "travel", "view", "bossHazard"]);
  // bossHazard: a boss hazard is dropped on clear ground this far (metres) beyond the hazard's radius, and this far beyond it from every entry.
  closed(d.bossHazard, ["bodyClearance", "entryGap"]);
  for (const f of ["bodyClearance", "entryGap"]) number("areaRuntime", `bossHazard.${f}`, d.bossHazard[f], 0);
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
    "artSize",
    "londonEntry",
    "entryClearance",
    "followReference",
    "referenceHeight",
    "maxZoom",
    "defaultPortraitScale",
  ]);
  // artSize: the painted backdrop's pixel size (its aspect crops the view); londonEntry: the start spawn in metres; entryClearance: the
  // body radius an entry or spawn must clear; followReference: the painting point whose projected height the player-size zoom keeps.
  if (!Array.isArray(d.view.artSize) || d.view.artSize.length !== 2)
    fail("areaRuntime", "view.artSize must hold width and height");
  d.view.artSize.forEach((n, i) => count("areaRuntime", `view.artSize[${i}]`, n, 1, 100000));
  closed(d.view.londonEntry, ["x", "z"]);
  closed(d.view.followReference, ["x", "y"]);
  for (const f of ["x", "z"]) number("areaRuntime", `view.londonEntry.${f}`, d.view.londonEntry[f], -1000);
  for (const f of ["x", "y"]) number("areaRuntime", `view.followReference.${f}`, d.view.followReference[f], 0);
  for (const f of ["entryClearance", "referenceHeight"]) number("areaRuntime", `view.${f}`, d.view[f], 0.001);
  number("areaRuntime", "view.maxZoom", d.view.maxZoom, 1);
  // defaultPortraitScale: the portrait actor size factor of a layout that names no `portraitScale` (1 = portraitActorPixels as is).
  number("areaRuntime", "view.defaultPortraitScale", d.view.defaultPortraitScale, 0.001);
  // defaultCharacterScale: the hero scale for a layout that names none (presence-session.js draws the other players with it).
  number("areaRuntime", "view.defaultCharacterScale", d.view.defaultCharacterScale, 0.1);
  count("areaRuntime", "view.textureBudgetMiB", d.view.textureBudgetMiB, 1, 1024);
  count("areaRuntime", "view.textureBudgetMinMiB", d.view.textureBudgetMinMiB, 1, d.view.textureBudgetMiB);
  number("areaRuntime", "view.cameraNear", d.view.cameraNear, 0.001);
  if (!(d.view.cameraFar > d.view.cameraNear && d.view.cameraFar <= 10000))
    fail("areaRuntime", "view.cameraFar must be above cameraNear, at most 10000");
  for (const f of [
    "portraitActorPixels",
    "landscapeZoomBoost",
    "portraitZoomBoost",
    "maxFollowSeconds",
    "exitHintMeters",
  ])
    number("areaRuntime", `view.${f}`, d.view[f], 0.001);
  for (const f of ["portraitLift", "landscapeLift"]) number("areaRuntime", `view.${f}`, d.view[f], 0);
  // travel: the "Traveling to ..." message delay, how long a failure message shows, and the area preparation slices (engine/areas.js).
  closed(d.travel, [
    "messageDelayMs",
    "failureMessageSeconds",
    "lockMessageSeconds",
    "travelMessageSeconds",
    "firstWaveDelay",
    "preparation",
  ]);
  for (const f of ["lockMessageSeconds", "travelMessageSeconds", "firstWaveDelay"])
    count("areaRuntime", `travel.${f}`, d.travel[f], 1, 60);
  count("areaRuntime", "travel.messageDelayMs", d.travel.messageDelayMs, 0, 10000);
  count("areaRuntime", "travel.failureMessageSeconds", d.travel.failureMessageSeconds, 1, 60);
  closed(d.travel.preparation, [
    "deadlineMs",
    "idleTimeoutMs",
    "urgentSliceMs",
    "ambientSliceMs",
    "idleEnoughMs",
    "holdMs",
  ]);
  for (const [name, v] of Object.entries(d.travel.preparation))
    count("areaRuntime", `travel.preparation.${name}`, v, 1, 5000);
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
  closed(d, ["schema_version", "pickupRadius", "dropSearch"]);
  number("uniqueReward", "pickupRadius", d.pickupRadius, 0.1);
  if (d.pickupRadius > 5) fail("uniqueReward", "pickupRadius must be up to 5 m");
  closed(d.dropSearch, ["ringSteps", "nearRadii", "fallbackRadii"]);
  count("uniqueReward", "dropSearch.ringSteps", d.dropSearch.ringSteps, 4, 64);
  if (d.dropSearch.ringSteps % 2)
    fail("uniqueReward", "dropSearch.ringSteps must be even (half a turn is a whole number of steps)");
  for (const name of ["nearRadii", "fallbackRadii"]) {
    const rows = d.dropSearch[name];
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 16)
      fail("uniqueReward", `dropSearch.${name} must list 1 to 16 radii`);
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
      if (!Array.isArray(rows) || rows.length !== length)
        fail("knifePaths", `${rig}.${name} must list ${length} frames`);
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
  for (const f of ["attackSeconds", "stopPadSeconds", "noiseBufferSeconds"])
    number("audio", `engine.${f}`, d.engine[f], 0.0001);
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
  closed(d, ["schema_version", "rules", "match", "view"]);
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

// remoteSurvivors.json: how the other players' figures are drawn and animated (engine/remote-survivors.js). Presentation only.
export function validateRemoteSurvivors(d) {
  closed(d, [
    "schema_version",
    "ringSegments",
    "ringInner",
    "ringOuter",
    "ringOpacity",
    "markerHeight",
    "maxFrameSeconds",
    "walkBlendPerSecond",
  ]);
  count("remoteSurvivors", "ringSegments", d.ringSegments, 8, 128);
  const ranges = [
    ["ringInner", 0.05, 5],
    ["ringOuter", 0.05, 5],
    ["ringOpacity", 0.05, 1],
    ["markerHeight", 0, 1],
  ];
  ranges.push(["maxFrameSeconds", 0.01, 1], ["walkBlendPerSecond", 0.5, 60]);
  for (const [name, min, max] of ranges)
    if (!Number.isFinite(d[name]) || d[name] < min || d[name] > max)
      fail("remoteSurvivors", `${name} must be ${min} to ${max}`);
  if (d.ringInner >= d.ringOuter) fail("remoteSurvivors", "ringInner must be below ringOuter");
}

// name -> [raw json, validator]. A function, not a table, so the loader itself adds nothing to the constant-table baseline.
const sources = () => ({
  knifePaths: [knifePaths, validateKnifePaths],
  audio: [audio, validateAudio],
  browserSession: [browserSession, validateBrowserSession],
  commander: [commander, validateCommander],
  commanderSession: [commanderSession, validateCommanderSession],
  runNotices: [runNotices, validateRunNotices],
  worldPickups: [worldPickups, validateWorldPickups],
  killDrops: [killDrops, validateKillDrops],
  webText: [webText, validateWebText],
  sessionText: [sessionText, validateSessionText],
  combatText: [combatText, validateCombatText],
  weaponViewText: [weaponViewText, validateWeaponViewText],
  safehouseText: [safehouseText, validateSafehouseText],
  airdrop: [airdrop, validateAirdrop],
  markedHunterSpawn: [markedHunterSpawn, validateMarkedHunterSpawn],
  chainedPitborn: [chainedPitborn, validateChainedPitborn],
  ratKing: [ratKing, validateRatKing],
  physicsDeath: [physicsDeath, validatePhysicsDeath],
  deathPresentation: [deathPresentation, validateDeathPresentation],
  physicsBody: [physicsBody, validatePhysicsBody],
  reaperMotion: [reaperMotion, validateReaperMotion],
  burnPresentation: [burnPresentation, validateBurnPresentation],
  appearance: [appearance, validateAppearance],
  atmosphere: [atmosphere, validateAtmosphere],
  areaRuntime: [areaRuntime, validateAreaRuntime],
  areas: [areas, validateAreas],
  bossRangedExtra: [bossRangedExtra, validateBossRangedData],
  donorMotion: [donorMotion, validateDonorMotionData],
  finisher: [finisher, validateFinisherData],
  combatRules: [combatRules, validateCombatRules],
  creatures: [creatures, validateCreatures],
  creatureDefinitions: [creatureDefinitions, validateCreatureDefinitions],
  diagnostics: [diagnostics, validateDiagnostics],
  locker: [locker, validateLocker],
  goldenWeapons: [goldenWeapons, validateGoldenWeapons],
  renderBudget: [renderBudget, validateRenderBudget],
  guestAuth: [guestAuth, validateGuestAuth],
  presenceClient: [presenceClient, validatePresenceClient],
  progressionBase: [progressionBase, validateProgressionBase],
  remoteSurvivors: [remoteSurvivors, validateRemoteSurvivors],
  railgunCoils: [railgunCoils, validateRailgunCoils],
  saveClient: [saveClient, validateSaveClient],
  spawns: [spawns, validateSpawns],
  supplies: [supplies, validateSupplies],
  uniqueReward: [uniqueReward, validateUniqueReward],
  visual: [visual, validateVisual],
  weapons: [weapons, validateWeapons],
  world: [world, validateWorld],
  worldEvents: [worldEvents, validateWorldEvents],
  trapCrates: [trapCrates, validateTrapCrates],
  offscreenActors: [offscreenActors, validateOffscreenActors],
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
// The safehouse weapon and supply names follow the locker's own id lists (locker.json weaponIds and resourceCaps).
checkSafehouseNameIds(
  GAME_DATA.safehouseText.safehouse.weaponNames,
  GAME_DATA.locker.weaponIds,
  "safehouse.weaponNames",
);
checkSafehouseNameIds(
  GAME_DATA.safehouseText.safehouse.resourceNames,
  Object.keys(GAME_DATA.locker.resourceCaps),
  "safehouse.resourceNames",
);
