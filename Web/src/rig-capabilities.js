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
// animal: the rig bites with teeth and bleeds flesh, and its contacts go through the shared animal contact path (combat.js).
// nativeSkeleton: the rig has its own skeleton and native bite (wolf-native.js, salamander-native.js): it reaches for a contact goal,
//   its knife hits carry the move definition, and it gets a bound animal role.
// areaPursuit: a resident of this rig with an area pursuit intent never loses its target to the leash.
// fireBreath: the rig's boss-flame attack is its breath, with a bite reaction when it starts.
// calfContact: the rig always bites the player's calf, even without a contact goal reach.
// mouthAim: the rig turns so its measured mouth surface, not its body centre, faces the target (wolf-native.js).
// calfFaceReceiver: the player gets a bite receiver built from this rig's `contact.calfFaces` (actors.js, salamander bites).
// bodyReceiver: the player gets the whole-body bite receiver (wolf-native.js wolfBodyReceiverBindings) for this rig's bites.
//
// Names (read with `rigText(rig, name)`):
// species: the kind of creature (rat, dog, roach, salamander, wolf, drone), one rig each; `rigOfSpecies(species)` is the rig id, for
//   the few places that address one kind by name.
// brain: which per-tick behaviour drives the rig in combat.js stepEnemy: rat, dog (dogs, roaches, wolves, salamanders) or drone.
//   A rig with none uses the humanoid behaviour.
// lowSwing: which low melee pose the player's knife uses against it (dog, roach); a native-skeleton rig uses the dog's mid pose,
//   the drone its own, and the rat the rat pose.
// appearanceKit: which coat library dresses a rig with an appearance id in actors.js (rat, roach); a rig with none gets the dog coats.
// coatName: the name of the coat material animal-appearance.js recolours on this rig's foundation model (rat, dog).
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
// feralScale: the actor scale at which the rig is the larger feral variant (feral coat library, scaled bite clip, the player's dog
//   bite receiver); actors.js.
// materialDim: a multiplier applied to the colour of every material the rig's model clones (actors.js).
// targetHeight / targetHeightReach: metres above the ground where shots and flame aim at the rig. `targetHeightReach` replaces
//   `targetHeight` while the rig is reaching for a contact goal (pistol-targeting.js combatTargetHeight).
import rows from "./rig-capabilities.json" with { type: "json" };

for (const [rig, row] of Object.entries(rows))
  for (const [name, value] of Object.entries(row))
    if (typeof value !== "boolean" && !(typeof value === "string" && value) && !(Number.isFinite(value) && value >= 0))
      throw TypeError(`Invalid rig capability ${rig}.${name}: must be true, false, a name or a finite number >= 0`);

export const RIG_CAPABILITIES = Object.freeze(
  Object.fromEntries(Object.entries(rows).map(([rig, row]) => [rig, Object.freeze({ ...row })])),
);

export function rigNumber(rig, name) {
  return Object.hasOwn(RIG_CAPABILITIES, rig) && Number.isFinite(RIG_CAPABILITIES[rig][name])
    ? RIG_CAPABILITIES[rig][name]
    : undefined;
}

export function rigOfSpecies(species) {
  const rig = Object.keys(RIG_CAPABILITIES).find((id) => RIG_CAPABILITIES[id].species === species);
  if (!rig) throw Error(`No rig has species ${species}`);
  return rig;
}

export function rigText(rig, name) {
  return Object.hasOwn(RIG_CAPABILITIES, rig) && typeof RIG_CAPABILITIES[rig][name] === "string"
    ? RIG_CAPABILITIES[rig][name]
    : undefined;
}

export function rigCapability(rig, name) {
  return Object.hasOwn(RIG_CAPABILITIES, rig) && RIG_CAPABILITIES[rig][name] === true;
}
