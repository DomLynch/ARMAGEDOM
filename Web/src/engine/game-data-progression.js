// progressionBase.json: the two numbers engine/progression-state.js used to hold inline. defaultMaxHP is the hit-point cap the model assumes
// when its caller gives none (the runtime always passes the player's own cap); placementRegistryMax is how many placement keys the progression
// registry accepts at most. The validator lives here so the loader (engine/game-data.js) stays under its size limit; game-data.js
// re-exports it and imports the JSON.
import { closed } from "./content-schema.js";
import { count } from "./game-data-checks.js";

export function validateProgressionBase(d) {
  closed(d, ["schema_version", "defaultMaxHP", "placementRegistryMax"]);
  count("progressionBase", "defaultMaxHP", d.defaultMaxHP, 1, 100000);
  count("progressionBase", "placementRegistryMax", d.placementRegistryMax, 1, 100000);
}
