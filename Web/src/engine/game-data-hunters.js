// markedHunterSpawn.json (engine/marked-hunters.js) and reaperMotion.json (engine/reaper.js): spawn-point clearances and message time of
// the Marked hunter, and the Reaper's step bound and orbit speed. The validators live here so the loader (engine/game-data.js) stays small.
import { closed } from "./content-schema.js";
import { fail, number } from "./game-data-checks.js";

export function validateMarkedHunterSpawn(d) {
  closed(d, ["schema_version", "bodyRadius", "safehouseRadius", "gateGap", "enemyGap", "gateDefaultCoordinate", "messageSeconds"]);
  for (const name of ["bodyRadius", "safehouseRadius", "gateGap", "enemyGap", "messageSeconds"]) number("markedHunterSpawn", name, d[name], 0.01);
  if (!(d.gateDefaultCoordinate >= 0 && d.gateDefaultCoordinate <= 1)) fail("markedHunterSpawn", "gateDefaultCoordinate must be 0 to 1");
}

export function validateChainedPitborn(d) {
  closed(d, ["schema_version", "enabled", "previewParam", "previewValue", "areaId", "model", "at", "facesToward",
    "scaleMultiplier", "hidePreviewSafehouse", "motion", "chains", "dust"]);
  if (typeof d.enabled !== "boolean") fail("chainedPitborn", "enabled must be true or false");
  for (const name of ["at", "facesToward"])
    if (!(d[name].x >= 0 && d[name].x <= 1 && d[name].y >= 0 && d[name].y <= 1)) fail("chainedPitborn", name + " must be art 0 to 1");
  number("chainedPitborn", "scaleMultiplier", d.scaleMultiplier, 0.1);
  if (!d.motion.clips.length || !d.chains.rows.length) fail("chainedPitborn", "needs clips and chain rows");
}

export function validateReaperMotion(d) {
  closed(d, ["schema_version", "maxStepSeconds", "orbitRate"]);
  if (!(d.maxStepSeconds > 0 && d.maxStepSeconds <= 1)) fail("reaperMotion", "maxStepSeconds must be above 0 and at most 1");
  number("reaperMotion", "orbitRate", d.orbitRate, 0.01);
}
