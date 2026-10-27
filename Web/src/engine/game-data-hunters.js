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
    "rigRef",
    "seed",
    "stepHz",
    "maxStepsPerFrame",
    "settleSeconds",
    "removeSeconds",
    "preloadIdleMs",
    "poolSize",
    "rewarmMs",
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
  ])
    number("physicsDeath", name, d[name], 1);
  if (d.killImpulse?.length !== 3 || !d.killImpulse.every(Number.isFinite))
    fail("physicsDeath", "killImpulse must be three numbers");
  if (Object.keys(d.parts).length !== 20) fail("physicsDeath", "parts must name the 20 ragdoll parts");
}

// physicsBody.json: the body measure row the ragdoll is built from, and the node-name prefix of the rig.
export function validatePhysicsBody(d) {
  closed(d, ["schema_version", "note", "nodePrefix", "row"]);
  if (typeof d.nodePrefix !== "string") fail("physicsBody", "nodePrefix must be a string");
  if (Object.keys(d.row?.joints ?? {}).length !== 20) fail("physicsBody", "row.joints must hold the 20 role joints");
  number("physicsBody", "height_m", d.row.height_m, 0.1);
}

export function validateChainedPitborn(d) {
  closed(d, ["schema_version", "enabled", "previewParam", "previewValue", "areaId", "model", "at", "facesToward",
    "scaleMultiplier", "emissive", "hidePreviewSafehouse", "motion", "chains", "dust"]);
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
