// visual.json `finisherImpact`: the blood burst defaults of a finisher impact that has no gore style of its own
// (finisher-impact-profile.js). Seconds, metres and metres per second squared; a head sever uses its own trail and drop sizes.
import { closed } from "./content-schema.js";
import { number } from "./game-data-checks.js";

const fields = [
  "trailSeconds",
  "headSeverTrailSeconds",
  "trailLength",
  "headSeverTrailLength",
  "dropSize",
  "headDropSize",
  "headSeverDropSize",
  "gravity",
];
export function validateFinisherImpact(d) {
  closed(d, fields);
  for (const f of fields) number("visual", `finisherImpact.${f}`, d[f], 0.001);
}
