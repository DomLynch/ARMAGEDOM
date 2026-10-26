// visual.json `motion` (motion.js): the procedural overlay on the imported clips. Seconds, metres, or shares of a 0-1 gait cycle.
// Checked when motion.js loads; kept out of game-data.js, which is at its source density limit.
import { closed } from "./content-schema.js";

const SMALLEST = 0.001; // no motion value may be below this: zero would divide or freeze the pose
const fail = (why) => {
  throw TypeError(`Invalid game data visual: motion.${why}`);
};
const positive = (field, v) => {
  if (!Number.isFinite(v) || v < SMALLEST) fail(`${field} must be a finite number >= ${SMALLEST}`);
};

export function validateMotion(m) {
  const GROUPS = {
    posePhase: ["windupShare", "minSeconds"],
    gait: ["walkStride", "otherStride", "fullRunSpeed", "runBlendSeconds", "strikeBlendSeconds", "guardBlendSeconds", "minStepSeconds"],
    swingFallback: ["windupSeconds", "recoverSeconds"],
    stab: ["startExtension", "peakExtension", "sideOffset", "drop"],
    heavyWindup: ["forward", "up", "aimForward"],
    guard: ["forward", "sideOffset", "drop", "aimSide"],
  };
  closed(m, [...Object.keys(GROUPS), "bigLift", "soleWeight", "plant"]);
  for (const [group, fields] of Object.entries(GROUPS)) {
    closed(m[group], fields);
    for (const f of fields) positive(`${group}.${f}`, m[group][f]);
  }
  positive("bigLift", m.bigLift);
  if (!(m.soleWeight > 0 && m.soleWeight < 1)) fail("soleWeight must be above 0 and below 1");
  if (!(m.posePhase.windupShare < 1)) fail("posePhase.windupShare must be below 1");
  closed(m.plant, ["minSpeed", "minRunWeight", "groundClearance", "maxDrift", "contactWindows"]);
  for (const f of ["minSpeed", "minRunWeight", "groundClearance", "maxDrift"]) positive(`plant.${f}`, m.plant[f]);
  closed(m.plant.contactWindows, ["walking", "other"]);
  for (const [gait, windows] of Object.entries(m.plant.contactWindows)) {
    if (!Array.isArray(windows) || windows.length !== 2) fail(`plant.contactWindows.${gait} must list two feet`);
    for (const w of windows)
      if (!Array.isArray(w) || w.length !== 2 || !(w[0] >= 0 && w[0] < w[1] && w[1] <= 1))
        fail(`plant.contactWindows.${gait} windows must be [start, end] within 0 to 1`);
  }
}
