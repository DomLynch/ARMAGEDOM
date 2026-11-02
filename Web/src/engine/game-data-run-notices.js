// runNotices.json: how many seconds each run message stays up (engine/run-core.js, engine/run-state.js). Not save rules.
// The validator lives here so the loader (engine/game-data.js) stays under its size limit; game-data.js re-exports it and imports the JSON.
import { closed } from "./content-schema.js";
import { fail } from "./game-data-checks.js";

export function validateRunNotices(d) {
  const seconds = [
    "storageUnavailableSeconds",
    "resetPromptSeconds",
    "bossDropSeconds",
    "supplyPickupSeconds",
    "supplyNoticeRepeatSeconds",
    "supplyRefusalSeconds",
    "vestEquippedSeconds",
  ];
  closed(d, ["schema_version", ...seconds]);
  for (const name of seconds)
    if (!Number.isFinite(d[name]) || d[name] < 0.5 || d[name] > 30) fail("runNotices", `${name} must be 0.5 to 30`);
}
