// markedHunterSpawn.json (engine/marked-hunters.js) and reaperMotion.json (engine/reaper.js): spawn-point clearances and message time of
// the Marked hunter, and the Reaper's step bound and orbit speed. The validators live here so the loader (engine/game-data.js) stays small.
import { closed } from "./content-schema.js";
import { fail, number } from "./game-data-checks.js";

export function validateMarkedHunterSpawn(d) {
  closed(d, [
    "schema_version",
    "bodyRadius",
    "safehouseRadius",
    "gateGap",
    "enemyGap",
    "gateDefaultCoordinate",
    "messageSeconds",
  ]);
  for (const name of ["bodyRadius", "safehouseRadius", "gateGap", "enemyGap", "messageSeconds"])
    number("markedHunterSpawn", name, d[name], 0.01);
  if (!(d.gateDefaultCoordinate >= 0 && d.gateDefaultCoordinate <= 1))
    fail("markedHunterSpawn", "gateDefaultCoordinate must be 0 to 1");
}

export function validatePhysicsBudget(d) {
  closed(d, ["schema_version", "rows"]);
  closed(d.rows, ["max_simultaneous_ragdolls"]);
  if (!Number.isInteger(d.rows.max_simultaneous_ragdolls) || d.rows.max_simultaneous_ragdolls < 1)
    fail("physicsBudget", "max_simultaneous_ragdolls must be an integer >= 1");
}

// physicsDeath.json (physics-death.js, the ?physics=1 pilot): flag, step rate, settle and removal seconds, kill impulse, part -> joint map.
export function validatePhysicsDeath(d) {
  closed(d, [
    "schema_version",
    "flagParam",
    "flagValue",
    "offValue",
    "defaultOn",
    "rigRef",
    "seed",
    "stepHz",
    "maxStepsPerFrame",
    "settleSeconds",
    "removeSeconds",
    "preloadIdleMs",
    "cutPrefetch",
    "poolSize",
    "rewarmMs",
    "maxActive",
    "killImpulse",
    "bulletImpulse",
    "parts",
  ]);
  for (const name of [
    "stepHz",
    "maxStepsPerFrame",
    "settleSeconds",
    "removeSeconds",
    "preloadIdleMs",
    "poolSize",
    "rewarmMs",
    "maxActive",
  ])
    number("physicsDeath", name, d[name], 1);
  closed(d.cutPrefetch, ["idleMs", "skipSaveData", "slowTypes"]);
  number("physicsDeath", "cutPrefetch.idleMs", d.cutPrefetch.idleMs, 1);
  if (typeof d.cutPrefetch.skipSaveData !== "boolean") fail("physicsDeath", "cutPrefetch.skipSaveData must be true or false");
  if (!Array.isArray(d.cutPrefetch.slowTypes) || d.cutPrefetch.slowTypes.some((t) => typeof t !== "string"))
    fail("physicsDeath", "cutPrefetch.slowTypes must be a list of connection types");
  if (typeof d.defaultOn !== "boolean") fail("physicsDeath", "defaultOn must be true or false");
  if (typeof d.offValue !== "string" || d.offValue === d.flagValue)
    fail("physicsDeath", "offValue must be a string that differs from flagValue");
  closed(d.killImpulse, ["horizontal", "up", "part"]);
  number("physicsDeath", "killImpulse.horizontal", d.killImpulse.horizontal, 0);
  number("physicsDeath", "killImpulse.up", d.killImpulse.up, 0);
  if (!Object.hasOwn(d.parts, d.killImpulse.part)) fail("physicsDeath", "killImpulse.part must be one of parts");
  if (Object.keys(d.parts).length !== 20) fail("physicsDeath", "parts must name the 20 ragdoll parts");
  const b = d.bulletImpulse;
  closed(b, ["flagParam", "offValue", "onValue", "defaultOn", "byWeapon", "byAttackClass", "zoneParts"]);
  if (typeof b.defaultOn !== "boolean") fail("physicsDeath", "bulletImpulse.defaultOn must be true or false");
  for (const key of ["flagParam", "offValue", "onValue"])
    if (typeof b[key] !== "string" || !b[key]) fail("physicsDeath", `bulletImpulse.${key} must be a non-empty string`);
  if (b.offValue === b.onValue) fail("physicsDeath", "bulletImpulse offValue must differ from onValue");
  for (const table of ["byWeapon", "byAttackClass"])
    for (const [name, row] of Object.entries(b[table])) {
      closed(row, ["horizontal", "up"]);
      number("physicsDeath", `bulletImpulse.${table}.${name}.horizontal`, row.horizontal, 0);
      number("physicsDeath", `bulletImpulse.${table}.${name}.up`, row.up, 0);
    }
  for (const [zone, part] of Object.entries(b.zoneParts))
    if (!Object.hasOwn(d.parts, part)) fail("physicsDeath", `bulletImpulse.zoneParts.${zone} must be one of parts`);
}

// deathPresentation.json (death-presentation.js): boss / marked-hunter slow-mo + camera push-in, ?deathcam=0 off.
export function validateDeathPresentation(d) {
  closed(d, [
    "schema_version",
    "note",
    "flagParam",
    "offValue",
    "defaultOn",
    "eligibleFlags",
    "timeScale",
    "slowSeconds",
    "easeBackSeconds",
    "pushInSeconds",
    "zoomPushPct",
    "focusShare",
    "retriggerCooldownSeconds",
    "maxTotalSlowSeconds",
    "dtSpikeSeconds",
    "idle",
  ]);
  const f = "deathPresentation";
  closed(d.idle, ["timeScale", "zoomMul", "weight", "active"]);
  if (d.idle.timeScale !== 1 || d.idle.zoomMul !== 1 || d.idle.weight !== 0 || d.idle.active !== false)
    fail(f, "idle must be timeScale 1, zoomMul 1, weight 0, active false");
  for (const name of ["retriggerCooldownSeconds", "maxTotalSlowSeconds", "dtSpikeSeconds"]) number(f, name, d[name], 0.01);
  if (d.maxTotalSlowSeconds < d.slowSeconds + d.easeBackSeconds)
    fail(f, "maxTotalSlowSeconds must cover one full slowSeconds + easeBackSeconds window");
  if (d.retriggerCooldownSeconds < d.slowSeconds + d.easeBackSeconds)
    fail(f, "retriggerCooldownSeconds must be at least slowSeconds + easeBackSeconds");
  if (typeof d.note !== "string" || !d.note) fail(f, "note must say the values are placeholders");
  if (typeof d.flagParam !== "string" || typeof d.offValue !== "string") fail(f, "flagParam and offValue must be strings");
  if (typeof d.defaultOn !== "boolean") fail(f, "defaultOn must be true or false");
  if (!Array.isArray(d.eligibleFlags) || !d.eligibleFlags.length || !d.eligibleFlags.every((x) => typeof x === "string" && x))
    fail(f, "eligibleFlags must name at least one entity field");
  for (const name of ["slowSeconds", "easeBackSeconds", "pushInSeconds"]) number(f, name, d[name], 0.01);
  if (!(d.timeScale > 0 && d.timeScale <= 1)) fail(f, "timeScale must be above 0 and at most 1");
  if (!(d.zoomPushPct >= 0 && d.zoomPushPct <= 50)) fail(f, "zoomPushPct must be 0 to 50");
  if (!(d.focusShare >= 0 && d.focusShare <= 1)) fail(f, "focusShare must be 0 to 1");
  if (d.slowSeconds + d.easeBackSeconds > 3) fail(f, "slowSeconds + easeBackSeconds must be at most 3");
}

// physicsBody.json: the body measure row the ragdoll is built from, and the node-name prefix of the rig.
export function validatePhysicsBody(d) {
  closed(d, ["schema_version", "note", "nodePrefix", "row"]);
  if (typeof d.nodePrefix !== "string") fail("physicsBody", "nodePrefix must be a string");
  if (Object.keys(d.row?.joints ?? {}).length !== 20) fail("physicsBody", "row.joints must hold the 20 role joints");
  number("physicsBody", "height_m", d.row.height_m, 0.1);
}

export function validateChainedPitborn(d) {
  closed(d, ["schema_version", "enabled", "offParam", "offValue", "areaId", "model", "at", "facesToward",
    "scaleMultiplier", "breakLoose", "chainedTargets", "emissive", "rim", "flicker", "motion", "chains", "dust"]);
  if (typeof d.enabled !== "boolean") fail("chainedPitborn", "enabled must be true or false");
  for (const name of ["at", "facesToward"])
    if (!(d[name].x >= 0 && d[name].x <= 1 && d[name].y >= 0 && d[name].y <= 1)) fail("chainedPitborn", name + " must be art 0 to 1");
  number("chainedPitborn", "scaleMultiplier", d.scaleMultiplier, 0.1);
  const numbers = ["hitRadiusMetres", "hitOriginMetres", "meleeReachMetres", "snapSeconds", "retrySeconds", "clearSearchMetres",
    "clearStepMetres", "clearDirections", "messageSeconds"];
  closed(d.breakLoose, ["enabled", ...numbers, "text"]);
  if (typeof d.breakLoose.enabled !== "boolean") fail("chainedPitborn", "breakLoose.enabled must be true or false");
  for (const name of numbers) number("chainedPitborn", "breakLoose." + name, d.breakLoose[name], 0.01);
  closed(d.breakLoose.text, ["snap", "loose"]);
  for (const name of ["snap", "loose"])
    if (typeof d.breakLoose.text[name] !== "string" || !d.breakLoose.text[name]) fail("chainedPitborn", "breakLoose.text." + name + " must be text");
  closed(d.chainedTargets, ["rays", "rays3d", "melee", "blasts", "cones", "blastPaddingMetres"]);
  for (const name of ["rays", "rays3d", "melee", "blasts", "cones"])
    if (!Array.isArray(d.chainedTargets[name]) || d.chainedTargets[name].some((t) => typeof t !== "string" || !t))
      fail("chainedPitborn", "chainedTargets." + name + " must be a list of event types");
  number("chainedPitborn", "chainedTargets.blastPaddingMetres", d.chainedTargets.blastPaddingMetres, 0.01);
  if (!d.motion.clips.length || !d.chains.rows.length) fail("chainedPitborn", "needs clips and chain rows");
}

export function validateRatKing(d) {
  closed(d, ["schema_version", "note", "enabled", "offParam", "offValue", "appearanceRef"]);
  if (typeof d.enabled !== "boolean") fail("ratKing", "enabled must be true or false");
  for (const name of ["offParam", "offValue", "appearanceRef"])
    if (typeof d[name] !== "string" || !/^[a-z0-9-]+$/.test(d[name])) fail("ratKing", `${name} must be a plain word`);
}

export function validateReaperMotion(d) {
  closed(d, ["schema_version", "maxStepSeconds", "orbitRate"]);
  if (!(d.maxStepSeconds > 0 && d.maxStepSeconds <= 1))
    fail("reaperMotion", "maxStepSeconds must be above 0 and at most 1");
  number("reaperMotion", "orbitRate", d.orbitRate, 0.01);
}
