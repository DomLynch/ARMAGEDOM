// What each creature rig can do, as data (creatures.json rigCapabilities). Engine code asks
// `rigCapability(rig, name)` instead of listing rig names. To give a rig a behaviour, add or
// change a row in the JSON; the as-data gate (scripts/as-data-gate.mjs) fails any PR that adds
// a new rig-name comparison elsewhere.
//
// lowStrike: the rig is a low target. Knife attacks against it use the low strike moves, its
//   melee reach is measured to its low contact point, and its bites are swept against the
//   player's body receiver.
// tutorialHunt: the Westminster tutorial's route arrow sends the player after this rig ("Kill the salamander"), before the
//   Ember Matron (engine/route-guidance.js huntTarget).
import { GAME_DATA } from "./engine/game-data.js";

// The rows live in Web/src/data/creatures.json `rigCapabilities` (validated and frozen by game-data.js).
export const RIG_CAPABILITIES = GAME_DATA.creatures.rigCapabilities;

export function rigCapability(rig, name) {
  return Object.hasOwn(RIG_CAPABILITIES, rig) && RIG_CAPABILITIES[rig][name] === true;
}
