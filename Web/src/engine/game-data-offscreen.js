// offscreenActors.json validator (engine/offscreen-actors.js reads the data). Kept apart so the throttle can read the quality tier,
// which reads the game data, without the loader importing the throttle.
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";
import { validateActorLod } from "./actor-lod.js";

export function validateOffscreenActors(d) {
  closed(d, [
    "schema_version",
    "enabled",
    "marginMetres",
    "farDistance",
    "everyNthFrame",
    "fullRateRadius",
    "shadowMaxDistance",
    "reducedRate",
    "lod",
  ]);
  closed(d.reducedRate, ["distance", "everyNthFrame"]);
  number("offscreenActors", "shadowMaxDistance", d.shadowMaxDistance, 1);
  number("offscreenActors", "reducedRate.distance", d.reducedRate.distance, 1);
  count("offscreenActors", "reducedRate.everyNthFrame", d.reducedRate.everyNthFrame, 1, 30);
  validateActorLod(d.lod);
  if (d.schema_version !== 1) fail("offscreenActors", "schema_version must be 1");
  if (typeof d.enabled !== "boolean") fail("offscreenActors", "enabled must be true or false");
  number("offscreenActors", "marginMetres", d.marginMetres, 0);
  number("offscreenActors", "farDistance", d.farDistance, 1);
  number("offscreenActors", "fullRateRadius", d.fullRateRadius, 0);
  count("offscreenActors", "everyNthFrame", d.everyNthFrame, 1, 30);
  if (d.fullRateRadius > d.farDistance) fail("offscreenActors", "fullRateRadius must not exceed farDistance");
}
