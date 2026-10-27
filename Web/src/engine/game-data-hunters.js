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
    "killImpulse",
    "parts",
  ]);
  for (const name of ["stepHz", "maxStepsPerFrame", "settleSeconds", "removeSeconds", "preloadIdleMs"])
    number("physicsDeath", name, d[name], 1);
  if (d.killImpulse?.length !== 3 || !d.killImpulse.every(Number.isFinite))
    fail("physicsDeath", "killImpulse must be three numbers");
  if (Object.keys(d.parts).length !== 20) fail("physicsDeath", "parts must name the 20 ragdoll parts");
}

export function validateReaperMotion(d) {
  closed(d, ["schema_version", "maxStepSeconds", "orbitRate"]);
  if (!(d.maxStepSeconds > 0 && d.maxStepSeconds <= 1))
    fail("reaperMotion", "maxStepSeconds must be above 0 and at most 1");
  number("reaperMotion", "orbitRate", d.orbitRate, 0.01);
}
