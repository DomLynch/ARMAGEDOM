// Deferred model files an area's creature slot needs when its creature respawns. A slot creature that is dead when the run is
// restored or the area is entered is not in the record's enemies or corpses, so the actors' ordinary model preparation never asks
// for its foundation; its respawn then builds an actor whose model is not loaded and throws inside the frame loop. The fresh path
// of actors.ensureAreaModels uses this same list (one source), without the placed bosses, which never respawn and stay deferred
// while dead.
import { slotAppearanceRefs } from "../area-mob-spawns.js";
import { crowdAreaRefs, ensureCrowdModels } from "./crowd-bodies.js";
export function slotModelRefs(world, areaId, manifest) {
  const policyArea = world.populationData?.areas[areaId];
  return [
    // Each cycle's creature and the creature its `off` fallback puts in the slot when its monster is switched off (?noelephant).
    ...Object.values(policyArea?.creatureSlot.cycles ?? {})
      .flatMap((spec) => [spec.foundationRef, spec.off?.foundationRef])
      .filter((ref) => ref !== undefined && manifest.models[ref]?.deferred === true),
    ...(world.residentPlacements?.[areaId] ?? [])
      .filter((row) => row.appearanceRef !== undefined)
      .map((row) => row.appearanceRef),
    ...slotAppearanceRefs(policyArea), // the Rat King's dressing, when switched on
  ];
}
// A promise only when something deferred has to load, so callers (`if (slot) await slot`) add no turn when it does not.
// Optional: a failed download leaves the creature without a model exactly as before, so it must not fail the boot or the entry.
// The crowd pool models the area's residents draw (engine/crowd-bodies.js) are optional in the same way and are not in slotModelRefs,
// which the required fresh path of actors.ensureAreaModels also reads.
export function ensureSlotModels(library, world, areaId) {
  if (!library?.manifest) return undefined;
  const refs = [...new Set(slotModelRefs(world, areaId, library.manifest))];
  const crowd = crowdAreaRefs(world, areaId).length > 0 ? ensureCrowdModels(library, world, areaId) : undefined;
  if (refs.length === 0) return crowd;
  const slot = Promise.resolve()
    .then(() => library.ensureModels?.(refs))
    .catch(() => {
      /* Retried by the next area entry or restore. */
    });
  return crowd ? Promise.all([slot, crowd]).then(() => undefined) : slot;
}
