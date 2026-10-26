import * as T from "three";
import { createRailgunCoils } from "../../src/engine/railgun-coils.js";

const round = (n) => Math.round(n * 1e9) / 1e9;

// Everything the coils build from their numbers: ring geometry and placement, material, arc points and the charge animation.
export function railgunCoilsTrace() {
  const root = new T.Group(),
    coils = createRailgunCoils(root),
    rings = coils.root.children.find((c) => c.isInstancedMesh),
    arc = coils.root.children.find((c) => c.isLine),
    material = rings.material,
    out = {
      ringCount: rings.count,
      ringPositions: Array.from(rings.geometry.getAttribute("position").array, round),
      ringIndex: Array.from(rings.geometry.index.array),
      ringMatrices: Array.from(rings.instanceMatrix.array, round),
      material: [
        material.color.getHex(),
        material.metalness,
        material.roughness,
        material.emissive.getHex(),
        material.emissiveIntensity,
      ],
      arcPoints: Array.from(arc.geometry.getAttribute("position").array, round),
      arcMaterial: [
        arc.material.color.getHex(),
        arc.material.transparent,
        arc.material.opacity,
        arc.material.depthWrite,
      ],
      frustumCulled: rings.frustumCulled,
      updates: [],
    };
  for (const args of [
    {},
    { charging: true, progress: 0, time: 0 },
    { charging: true, progress: 0.5, time: 0.13 },
    { charging: true, progress: 1, time: 1.7 },
    { charging: true, progress: 2, time: 3.1 },
    { charging: false, progress: 0.7, time: 5 },
    { charging: true, progress: 0.3, time: 0.4, visible: false },
  ]) {
    coils.update(args);
    out.updates.push([coils.root.visible, arc.visible, round(material.emissiveIntensity), round(arc.material.opacity)]);
  }
  coils.dispose();
  return out;
}
