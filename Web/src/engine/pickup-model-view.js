import * as T from "three";
import { addPickupGlow } from "../pickup-glow.js";
import { PICKUP_MODEL } from "./boss-equipment-view-data.js";
export function createPickupModel(source, { rootName = null, rotate = false, ground = true } = {}) {
  const original = rootName ? source?.scene?.getObjectByName(rootName) : source?.scene;
  if (!original) throw Error("Reward model unavailable");
  const root = new T.Group(),
    display = original.clone(true),
    materials = [],
    contours = [],
    meshes = [];
  root.add(display);
  if (rotate) display.rotation.z = Math.PI / 2; // tuning-ok: lays a long weapon model flat
  try {
    display.traverse((mesh) => {
      if (!mesh.isMesh) return;
      if (mesh.isSkinnedMesh) throw Error("Rigid reward model required");
      const own = [mesh.material].flat().map((material) => {
        if (!material?.isMeshStandardMaterial) throw Error("Reward PBR material required");
        const copy = material.clone();
        materials.push(copy);
        return copy;
      });
      mesh.material = Array.isArray(mesh.material) ? own : own[0];
      meshes.push(mesh);
    });
    if (!meshes.length) throw Error("Empty reward model");
    // Snapshot the original meshes before adding the inverse-hull children.
    for (const mesh of meshes) contours.push(addPickupGlow(mesh));
    if (ground) {
      root.updateWorldMatrix(true, true);
      let box = new T.Box3().setFromObject(root),
        size = box.getSize(new T.Vector3());
      display.scale.multiplyScalar(Math.min(1, PICKUP_MODEL.fitDiameter / Math.hypot(size.x, size.z)));
      root.updateWorldMatrix(true, true);
      box = new T.Box3().setFromObject(root);
      const centre = box.getCenter(new T.Vector3());
      display.position.add(new T.Vector3(-centre.x, PICKUP_MODEL.groundLift - box.min.y, -centre.z));
    }
  } catch (error) {
    for (const contour of contours) contour.dispose();
    for (const material of materials) material.dispose();
    throw error;
  }
  let disposed = false;
  return {
    root,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const contour of contours) contour.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
