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
// breathEmitter: while its boss weapon is active the rig is the source of the fire-breath glow (effects.js getEmission).
//
// hoverTarget: the rig flies; shots and flame aim at its animated hover height (drone-mechanics.js droneHoverHeight).
//
// fixedPointerScale: touch aim does not rescale the rig by its rendered size (pistol-targeting.js rangedPointerPoint).
//
// Numbers (a row may also carry measured values, read with `rigNumber(rig, name)`):
// targetHeight / targetHeightReach: metres above the ground where shots and flame aim at the rig. `targetHeightReach` replaces
//   `targetHeight` while the rig is reaching for a contact goal (pistol-targeting.js combatTargetHeight).
import { GAME_DATA } from "./engine/game-data.js";

// The rows live in Web/src/data/creatures.json `rigCapabilities` (validated and frozen by game-data.js).
export const RIG_CAPABILITIES = GAME_DATA.creatures.rigCapabilities;

export function rigNumber(rig, name) {
  return Object.hasOwn(RIG_CAPABILITIES, rig) && Number.isFinite(RIG_CAPABILITIES[rig][name])
    ? RIG_CAPABILITIES[rig][name]
    : undefined;
}

export function rigCapability(rig, name) {
  return Object.hasOwn(RIG_CAPABILITIES, rig) && RIG_CAPABILITIES[rig][name] === true;
}
