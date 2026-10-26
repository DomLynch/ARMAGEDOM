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
// animal: the rig bites with teeth and bleeds flesh, and its contacts go through the shared animal contact path (combat.js).
// nativeSkeleton: the rig has its own skeleton and native bite (wolf-native.js, salamander-native.js): it reaches for a contact goal,
//   its knife hits carry the move definition, and it gets a bound animal role.
// areaPursuit: a resident of this rig with an area pursuit intent never loses its target to the leash.
// fireBreath: the rig's boss-flame attack is its breath, with a bite reaction when it starts.
// calfContact: the rig always bites the player's calf, even without a contact goal reach.
// mouthAim: the rig turns so its measured mouth surface, not its body centre, faces the target (wolf-native.js).
//
// Names (read with `rigText(rig, name)`):
// brain: which per-tick behaviour drives the rig in combat.js stepEnemy: rat, dog (dogs, roaches, wolves, salamanders) or drone.
//   A rig with none uses the humanoid behaviour.
// lowSwing: which low melee pose the player's knife uses against it (dog, roach); a native-skeleton rig uses the dog's mid pose,
//   the drone its own, and the rat the rat pose.
// biteMove: which bite the rig throws (wolf, salamander, roach); a rig with none throws the dog bite.
// breathEmitter: while its boss weapon is active the rig is the source of the fire-breath glow (effects.js getEmission).
//
// hoverTarget: the rig flies; shots and flame aim at its animated hover height (drone-mechanics.js droneHoverHeight).
//
// fixedPointerScale: touch aim does not rescale the rig by its rendered size (pistol-targeting.js rangedPointerPoint).
//
// strictAlive: the rig counts as alive only above 0 health; other rigs count any non-zero health as alive (rig-response.js).
//
// Names and numbers for the hit and death reactions (rig-response.js; a rig with none uses creatures.json defaultResponse):
// hitClip / deathClip: the clip names; hitTicks / deathTicks: how long the reaction holds, in 60 Hz ticks.
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

export function rigText(rig, name) {
  return Object.hasOwn(RIG_CAPABILITIES, rig) && typeof RIG_CAPABILITIES[rig][name] === "string"
    ? RIG_CAPABILITIES[rig][name]
    : undefined;
}

export function rigCapability(rig, name) {
  return Object.hasOwn(RIG_CAPABILITIES, rig) && RIG_CAPABILITIES[rig][name] === true;
}
