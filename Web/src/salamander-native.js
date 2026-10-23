export const SALAMANDER_RIG = "giant-salamander";
export const SALAMANDER_BITE = Object.freeze({
  moveId: "salamander_bite",
  clip: "Bite",
  foundationRef: SALAMANDER_RIG,
  windupTicks: 20,
  activeTicks: 12,
  recoveryTicks: 24,
  windup: 20 / 60,
  active: 12 / 60,
  recovery: 24 / 60,
  damage: 4,
  staminaDamage: 4,
  range: 1.25,
  weapon: "teeth",
});
export function salamanderResponse(alive, start) {
  return { clip: alive ? "Hurt" : "Death", start, ticks: alive ? 32 : 74 };
}

// Native Bite opens the own mouth at ticks 20–31; its teeth swing remains separate.
export const SALAMANDER_BREATH = Object.freeze({
  kind: "flame",
  range: 4.86,
  coneDegrees: 40,
  windupTicks: 20,
  activeTicks: 12,
  intervalTicks: 6,
  recoveryTicks: 54,
  damage: 4,
  minDistance: 3.45,
  acquisitionRange: 7.96,
});
export function salamanderMouthSource(view, entity, point) {
  const mesh = view?.model.getObjectByName("world-raw");
  if (entity?.rig !== SALAMANDER_RIG || !mesh?.isSkinnedMesh) return null;
  mesh.getVertexPosition(5727, point).applyMatrix4(mesh.matrixWorld);
  return {
    position: { x: point.x, y: point.y, z: -point.z },
    direction: { x: entity.facing.x, y: 0, z: entity.facing.z },
  };
}
