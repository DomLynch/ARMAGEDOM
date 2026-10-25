// What each creature rig can do, as data (rig-capabilities.json). Engine code asks
// `rigCapability(rig, name)` instead of listing rig names. To give a rig a behaviour, add or
// change a row in the JSON; the as-data gate (scripts/as-data-gate.mjs) fails any PR that adds
// a new rig-name comparison elsewhere.
//
// lowStrike: the rig is a low target. Knife attacks against it use the low strike moves, its
//   melee reach is measured to its low contact point, and its bites are swept against the
//   player's body receiver.
// tutorialHunt: the Westminster tutorial's route arrow sends the player after this rig ("Kill the salamander"), before the
//   Ember Matron (engine/route-guidance.js huntTarget).
import rows from "./rig-capabilities.json" with { type: "json" };

export const RIG_CAPABILITIES = Object.freeze(
  Object.fromEntries(Object.entries(rows).map(([rig, row]) => [rig, Object.freeze({ ...row })])),
);

export function rigCapability(rig, name) {
  return Object.hasOwn(RIG_CAPABILITIES, rig) && RIG_CAPABILITIES[rig][name] === true;
}
