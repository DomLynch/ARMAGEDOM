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
    "poolSize",
    "rewarmMs",
    "maxActive",
    "killImpulse",
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
  if (typeof d.defaultOn !== "boolean") fail("physicsDeath", "defaultOn must be true or false");
  if (typeof d.offValue !== "string" || d.offValue === d.flagValue)
    fail("physicsDeath", "offValue must be a string that differs from flagValue");
  if (d.killImpulse?.length !== 3 || !d.killImpulse.every(Number.isFinite))
    fail("physicsDeath", "killImpulse must be three numbers");
  if (Object.keys(d.parts).length !== 20) fail("physicsDeath", "parts must name the 20 ragdoll parts");
}

// zoneDamage.json (zone-damage.js, the ?zones=1 flag-off trash zone damage): flag, front/back arc half-angles, multiplier per arc, cap, boss kinds.
export function validateZoneDamage(d) {
  closed(d, [
    "schema_version",
    "note",
    "flagParam",
    "flagValue",
    "seed",
    "zones",
    "weights",
    "facingBonus",
    "cap",
    "bosses",
    "bossHook",
  ]);
  closed(d.facingBonus, ["arcs", "front", "flank", "back"]);
  closed(d.facingBonus.arcs, ["frontHalfDeg", "backHalfDeg"]);
  for (const name of ["flagParam", "flagValue", "note", "bossHook"])
    if (typeof d[name] !== "string" || !d[name]) fail("zoneDamage", name + " must be a non-empty string");
  number("zoneDamage", "seed", d.seed, 0);
  const arcs = d.facingBonus.arcs;
  for (const name of ["frontHalfDeg", "backHalfDeg"]) number("zoneDamage", name, arcs[name], 1);
  if (arcs.frontHalfDeg + arcs.backHalfDeg > 180)
    fail("zoneDamage", "front and back arcs must leave a flank (sum <= 180)");
  // Facing only modifies: every bonus is a positive number, so a hit is never zeroed or blocked by where the target looks.
  for (const name of ["front", "flank", "back"]) number("zoneDamage", name, d.facingBonus[name], 0.01);
  const zones = Object.keys(d.zones);
  if (!zones.length) fail("zoneDamage", "zones must name at least one zone");
  for (const z of zones) {
    closed(d.zones[z], ["multiplier"]);
    number("zoneDamage", z + ".multiplier", d.zones[z].multiplier, 0.01);
  }
  if (!d.weights?.default) fail("zoneDamage", "weights needs a default row");
  for (const [key, w] of Object.entries(d.weights)) {
    closed(w, zones);
    for (const z of zones) number("zoneDamage", key + "." + z, w[z], 0);
    if (!zones.some((z) => w[z] > 0)) fail("zoneDamage", key + " needs a positive weight");
  }
  number("zoneDamage", "cap", d.cap, 1);
  if (!Array.isArray(d.bosses) || !d.bosses.every(Number.isSafeInteger))
    fail("zoneDamage", "bosses must list integer kinds");
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
    "scaleMultiplier", "emissive", "rim", "horns", "flicker", "motion", "chains", "dust"]);
  if (typeof d.enabled !== "boolean") fail("chainedPitborn", "enabled must be true or false");
  for (const name of ["at", "facesToward"])
    if (!(d[name].x >= 0 && d[name].x <= 1 && d[name].y >= 0 && d[name].y <= 1)) fail("chainedPitborn", name + " must be art 0 to 1");
  number("chainedPitborn", "scaleMultiplier", d.scaleMultiplier, 0.1);
  if (!d.motion.clips.length || !d.chains.rows.length) fail("chainedPitborn", "needs clips and chain rows");
}

export function validateReaperMotion(d) {
  closed(d, ["schema_version", "maxStepSeconds", "orbitRate"]);
  if (!(d.maxStepSeconds > 0 && d.maxStepSeconds <= 1))
    fail("reaperMotion", "maxStepSeconds must be above 0 and at most 1");
  number("reaperMotion", "orbitRate", d.orbitRate, 0.01);
}
