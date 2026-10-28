// Deferred model files an area's creature slot needs when its creature respawns. A slot creature that is dead when the run is
// restored or the area is entered is not in the record's enemies or corpses, so the actors' ordinary model preparation never asks
// for its foundation; its respawn then builds an actor whose model is not loaded and throws inside the frame loop. This mirrors
// the slot and resident refs of actors.ensureAreaModels(record, area, { fresh: true }) (Web/tests/slot-models.test.js pins
// the two together) without the placed bosses, which never respawn and stay deferred while dead.
export function slotModelRefs(world, areaId, manifest) {
  return [
    ...Object.values(world.populationData?.areas[areaId]?.creatureSlot.cycles ?? {})
      .map((spec) => spec.foundationRef)
      .filter((ref) => manifest.models[ref]?.deferred === true),
    ...(world.residentPlacements?.[areaId] ?? [])
      .filter((row) => row.appearanceRef !== undefined)
      .map((row) => row.appearanceRef),
  ];
}
// A promise only when something deferred has to load, so callers (`if (slot) await slot`) add no turn when it does not.
// Optional: a failed download leaves the creature without a model exactly as before, so it must not fail the boot or the entry.
export function ensureSlotModels(library, world, areaId) {
  if (!library?.manifest) return undefined;
  const refs = [...new Set(slotModelRefs(world, areaId, library.manifest))];
  if (refs.length === 0) return undefined;
  return Promise.resolve()
    .then(() => library.ensureModels?.(refs))
    .catch(() => {
      /* Retried by the next area entry or restore. */
    });
}
