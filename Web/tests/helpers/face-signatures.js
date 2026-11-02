import fs from "node:fs";
import { createHash } from "node:crypto";
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { FACE_RECIPES } from "../../src/face-recipes.js";
import { createFaceAppearanceLibrary } from "../../src/face-appearance.js";

// One SHA-256 per face recipe over everything face-appearance.js writes onto an actor clone: the three head geometries (position, normal,
// colour, index), the affected material colours, and the generated hair mesh and material. Used by the differential tests that prove a data
// move did not change a value.
globalThis.ProgressEvent ??= class {
  constructor(_, fields) {
    Object.assign(this, fields);
  }
};
export async function loadHollowSource() {
  const bytes = fs.readFileSync(new URL("../../public/assets/hollow-scavenger/hollow-scavenger.glb", import.meta.url));
  const n = bytes.readUInt32LE(12),
    doc = JSON.parse(bytes.subarray(20, 20 + n)),
    bin = bytes.subarray(28 + n);
  doc.images = [];
  doc.textures = [];
  doc.materials = doc.materials.map((m) => ({ name: m.name }));
  doc.buffers[0].uri = "data:application/octet-stream;base64," + bin.toString("base64");
  return (await new GLTFLoader().parseAsync(JSON.stringify(doc), "")).scene;
}
function ownClone(source) {
  const model = clone(source);
  model.traverse((n) => {
    if (n.isMesh) n.material = Array.isArray(n.material) ? n.material.map((m) => m.clone()) : n.material.clone();
  });
  return model;
}
function feed(hash, geometry) {
  for (const [name, attribute] of Object.entries(geometry.attributes))
    hash
      .update(name)
      .update(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
  if (geometry.index)
    hash.update(
      new Uint8Array(geometry.index.array.buffer, geometry.index.array.byteOffset, geometry.index.array.byteLength),
    );
}
export async function faceSignatures(recipes = FACE_RECIPES) {
  const source = await loadHollowSource(),
    kit = createFaceAppearanceLibrary(source),
    model = ownClone(source),
    out = {};
  for (const recipe of recipes) {
    const handle = kit.apply(model, recipe.id),
      hash = createHash("sha256");
    model.traverse((n) => {
      if (!n.isMesh) return;
      if (n.name === "Photo" || n.name === "PhotoEyes" || n.name === "PhotoTeeth" || n.name === "Scavenger hair")
        feed(hash, n.geometry);
      for (const m of Array.isArray(n.material) ? n.material : [n.material])
        hash.update(
          JSON.stringify([n.name, m.name, m.color.toArray(), m.vertexColors, m.roughness, m.metalness, m.side]),
        );
    });
    out[recipe.id] = hash.digest("hex");
    handle.dispose();
  }
  kit.dispose();
  return out;
}
export { T };
