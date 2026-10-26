// commanderSession.json: the Commander screen's frame and input pacing (engine/commander/session.js). Not match rules.
// The validator lives here so the loader (engine/game-data.js) stays under its size limit; game-data.js re-exports it and imports the JSON.
import { closed } from "./content-schema.js";
import { count, fail } from "./game-data-checks.js";

export function validateCommanderSession(d) {
  closed(d, ["schema_version", "maxFrameSeconds", "maxStepsPerFrame", "panStep", "dragThresholdPx", "maxApiStepSeconds"]);
  count("commanderSession", "maxStepsPerFrame", d.maxStepsPerFrame, 1, 30);
  count("commanderSession", "dragThresholdPx", d.dragThresholdPx, 1, 100);
  for (const [name, min, max] of [["maxFrameSeconds", 0.01, 1], ["panStep", 0.001, 0.5], ["maxApiStepSeconds", 0.1, 60]])
    if (!Number.isFinite(d[name]) || d[name] < min || d[name] > max) fail("commanderSession", `${name} must be ${min} to ${max}`);
}
