import { CREATURE_MOVES, SALAMANDER_BREATH } from "./creature-moves.js";
export const SALAMANDER_RIG = "giant-salamander";
// The bite and the flame breath are rows of Web/src/data/creatures.json (resolved in creature-moves.js).
export const SALAMANDER_BITE = CREATURE_MOVES.salamander_bite;
export function salamanderResponse(alive, start) {
  return { clip: alive ? "Hurt" : "Death", start, ticks: alive ? 32 : 74 };
}

// Native Bite opens the own mouth at ticks 20–31; its teeth swing remains separate.
export { SALAMANDER_BREATH };
export function salamanderMouthSource(view, entity, point) {
  const mesh = view?.model.getObjectByName("world-raw");
  if (entity?.rig !== SALAMANDER_RIG || !mesh?.isSkinnedMesh) return null;
  mesh.getVertexPosition(5727, point).applyMatrix4(mesh.matrixWorld);
  return {
    position: { x: point.x, y: point.y, z: -point.z },
    direction: { x: entity.facing.x, y: 0, z: entity.facing.z },
  };
}
