// Drops a boss through the shipped ragdoll path (startDeath -> stepDeath, the rows in physicsRigs.json, the real GLB) and reports how far the
// skinned mesh ends below the floor. The actor root is built the way actors.js builds it (the layout, manifest and visual scales), and its position
// is put back to the floor every frame the way actors.js does, so a corpse that is seated on the floor has to be seated by the ragdoll code itself.
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { GAME_DATA } from "../../src/engine/game-data.js";
import { usePhysicsDeathImpl } from "../../src/engine/physics-death.js";
import { rigOf } from "../../src/engine/physics-rigs.js";
import { loadGeometryOnly } from "../../tools/glb-geometry-only.js";

const CFG = GAME_DATA.physicsDeath,
  manifest = JSON.parse(readFileSync(new URL("../../public/assets/manifest-hollow.json", import.meta.url), "utf8")).models;

let impl = null;
const load = async () => {
  if (!impl) {
    impl = await import("../../src/engine/physics-death-impl.js");
    usePhysicsDeathImpl(impl);
    await impl.loadWorld();
  }
  return impl;
};

// Lowest skinned vertex in WORLD space (the floor is world y = 0), with the name of the mesh it belongs to.
export function lowestVertex(root) {
  root.updateWorldMatrix(true, true);
  const v = new THREE.Vector3();
  let low = { y: Infinity, mesh: null };
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    for (let i = 0; i < o.geometry.attributes.position.count; i++) {
      o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld);
      if (v.y < low.y) low = { y: v.y, mesh: o.name };
    }
  });
  return low;
}

// The model's scale in the game: area layout x manifest x the session's visual scale (actors.js).
export const actorScale = (model) =>
  GAME_DATA.areaRuntime.view.defaultCharacterScale * (manifest[model].scale ?? 1) * GAME_DATA.browserSession.actorVisualScale;

// { rest, settled, scale } = the lowest vertex before the first step and after `seconds` of ragdoll, in world metres, and the root scale
// (divide by it for the unscaled model).
export async function bossSettle(model, { seconds = CFG.settleSeconds, afterSeconds = 0 } = {}) {
  const i = await load(),
    gltf = await loadGeometryOnly(new URL(`../../public/assets/${manifest[model].url}`, import.meta.url)),
    scale = actorScale(model),
    root = new THREE.Group(),
    view = { root, model: clone(gltf.scene), description: manifest[model] };
  root.scale.setScalar(scale);
  root.add(view.model);
  root.updateWorldMatrix(true, true);
  const rest = lowestVertex(root),
    s = i.startDeath(view, gltf.scene, { id: 7, kind: 5, hp: 0, maxHP: 10, bossProfile: {}, facing: { x: 0, z: 1 } }, rigOf(model)),
    dt = 1 / CFG.stepHz,
    frame = () => {
      root.position.set(0, 0, 0); // actors.js puts the root back on the floor every frame
      root.updateMatrixWorld(true);
      i.stepDeath(s, dt);
    };
  try {
    for (let t = 0; t < seconds + dt; t += dt) frame();
    const settled = lowestVertex(root);
    // the corpse lies on after the body is freed (settleSeconds, then removeSeconds): the seat has to stay
    for (let t = 0; t < afterSeconds; t += dt) frame();
    const later = afterSeconds ? lowestVertex(root) : settled;
    return { rest, settled, later, scale, root };
  } finally {
    i.releaseDeath(s); // a failed assertion in one test must not leave a corpse that eats the cap of the next
  }
}
