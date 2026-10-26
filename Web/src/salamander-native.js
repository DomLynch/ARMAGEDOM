import { CREATURE_MOVES, SALAMANDER_BREATH } from "./creature-moves.js";
import { rigNumber, rigText } from "./rig-capabilities.js";
import { rigResponse } from "./rig-response.js";
// The bite and the flame breath are rows of Web/src/data/creatures.json (resolved in creature-moves.js).
export const SALAMANDER_BITE = CREATURE_MOVES.salamander_bite;
// The reaction clips and ticks are the salamander's rigCapabilities row.
export function salamanderResponse(alive, start) {
  return rigResponse("giant-salamander", alive ? 1 : 0, start);
}

// Native Bite opens the own mouth at ticks 20–31; its teeth swing remains separate.
export { SALAMANDER_BREATH };
export function salamanderMouthSource(view, entity, point) {
  const mesh = view?.model.getObjectByName("world-raw");
  if (rigText(entity?.rig, "species") !== "salamander" || !mesh?.isSkinnedMesh) return null;
  mesh.getVertexPosition(rigNumber(entity.rig, "mouthVertex"), point).applyMatrix4(mesh.matrixWorld);
  return {
    position: { x: point.x, y: point.y, z: -point.z },
    direction: { x: entity.facing.x, y: 0, z: entity.facing.z },
  };
}
