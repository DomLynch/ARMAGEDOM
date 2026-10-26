import { CREATURE_MOVES } from "./creature-moves.js";
import { GAME_DATA } from "./engine/game-data.js";
import { rigNumber, rigOfSpecies } from "./rig-capabilities.js";
import { rigResponse } from "./rig-response.js";
// Own wolf skeleton and native Bite; no Dog retargeting or flame profile.
// The bite is a row of Web/src/data/creatures.json (resolved in creature-moves.js).
const WOLF = rigOfSpecies("wolf");
export const WOLF_BITE = CREATURE_MOVES.wolf_bite;
// The reaction clips and ticks are the wolf's rigCapabilities row.
export function wolfResponse(alive, start) {
  return rigResponse(WOLF, alive ? 1 : 0, start);
}
// The measured mouth surface is rigCapabilities `mouthOffset` metres to the actor's right, at the wolf's bite reach. Aim the
// existing native root so that surface, rather than the body centre, faces the torso.
export function wolfBiteDirection(direction) {
  const angle = Math.atan2(rigNumber(WOLF, "mouthOffset"), GAME_DATA.creatures.catalogue.reach[WOLF]),
    c = Math.cos(angle),
    s = Math.sin(angle);
  return { x: direction.x * c - direction.z * s, z: direction.x * s + direction.z * c };
}
// Build once from the unchanged player skin. The existing posed-triangle
// receiver remains the damage authority; this replaces the now-low calf faces.
export function wolfBodyReceiverBindings(model) {
  const mesh = model.getObjectByName("Skin"),
    geometry = mesh.geometry,
    indices = geometry.index,
    skin = geometry.attributes.skinIndex,
    weights = geometry.attributes.skinWeight,
    names = new Set(["pelvis", "spine_01", "spine_02", "spine_03"]),
    body = new Set(mesh.skeleton.bones.flatMap((b, i) => (names.has(b.name) ? [i] : []))),
    vertices = new Set();
  for (let i = 0; i < skin.count; i++) {
    let sum = 0;
    for (let j = 0; j < 4; j++) if (body.has(skin.getComponent(i, j))) sum += weights.getComponent(i, j);
    if (sum >= 0.5) vertices.add(i);
  }
  const faceBindings = [];
  for (let face = 0; face < indices.count / 3; face++) {
    const row = [0, 1, 2].map((k) => indices.getX(face * 3 + k));
    if (row.some((i) => vertices.has(i))) faceBindings.push({ face, vertices: row });
  }
  return [{ runtimeName: "Skin", faceBindings }];
}
