// Presentation numbers for donor-motion.js: the swing-phase curve, the bone-saw poses and the locomotion clock.
import input from "./donor-motion-data.json" with { type: "json" };

const closed = (x, keys) => {
  if (!x || typeof x !== "object" || Object.keys(x).length !== keys.length || keys.some((k) => !Object.hasOwn(x, k)))
    throw TypeError("Invalid donor motion data");
};
const freeze = (x) => {
  for (const child of Object.values(x)) if (child && typeof child === "object") freeze(child);
  return Object.freeze(x);
};
const finite = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
const fail = () => {
  throw TypeError("Invalid donor motion data");
};
export function validateDonorMotionData(value) {
  const d = structuredClone(value);
  closed(d, ["swing", "samplePhaseMax", "saw", "locomotion"]);
  closed(d.swing, ["windupKeyFraction", "windupSourceFraction", "followThrough", "followThroughFraction"]);
  closed(d.saw, ["windup", "active", "recovery"]);
  closed(d.locomotion, ["moveSpeed", "runSpeed", "walkRate", "runRate", "strafeRate", "sprintSpeed"]);
  if (
    !finite(d.swing.windupKeyFraction, 0.1, 1) ||
    !finite(d.swing.windupSourceFraction, 0, 1) ||
    !finite(d.swing.followThrough, 0.01, 0.5) ||
    !finite(d.swing.followThroughFraction, 0, 1) ||
    !finite(d.samplePhaseMax, 0.9, 1) ||
    !Object.values(d.saw).every((n) => finite(n, 0, 1)) ||
    !finite(d.locomotion.moveSpeed, 0.001, 1) ||
    !finite(d.locomotion.runSpeed, 1, 20) ||
    !finite(d.locomotion.walkRate, 0.1, 20) ||
    !finite(d.locomotion.runRate, 0.1, 20) ||
    !finite(d.locomotion.strafeRate, 0.1, 20) ||
    !finite(d.locomotion.sprintSpeed, 1, 20)
  )
    fail();
  return freeze(d);
}
export const DONOR_MOTION = validateDonorMotionData(input);
