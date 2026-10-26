import { createHash } from "node:crypto";
import * as T from "three";
import { ANIMAL_APPEARANCES, createAnimalAppearanceLibrary } from "../../src/animal-appearance.js";
import { rigText } from "../../src/rig-capabilities.js";

// One SHA-256 per animal recipe over the geometry (position, normal, colour) and the material the library writes onto a synthetic skinned
// coat mesh: 240 vertices at pseudo-random positions whose torso skin weight sweeps from 0 to 1, so the taper mask and the patch field are
// exercised across their whole range. Used by the differential test that proves a data move changed no value.
function lcg(seed) {
  let s = seed;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function coatFixture(coatName) {
  const next = lcg(7),
    count = 240,
    positions = [],
    indices = [],
    weights = [];
  for (let i = 0; i < count; i++) {
    positions.push((next() - 0.5) * 0.8, next() * 0.6, (next() - 0.5) * 1.4);
    const torso = i / (count - 1); // 0 to 1 across the mesh
    weights.push(torso, 1 - torso, 0, 0);
    indices.push(0, 1, 0, 0);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("skinIndex", new T.Uint16BufferAttribute(indices, 4));
  g.setAttribute("skinWeight", new T.Float32BufferAttribute(weights, 4));
  g.setIndex(Array.from({ length: (count - 2) * 3 }, (_, k) => (k % 3) + Math.floor(k / 3)));
  const material = new T.MeshStandardMaterial({ map: new T.Texture(), color: 0xc8b49a });
  material.name = coatName;
  const torsoBone = new T.Bone(),
    otherBone = new T.Bone();
  torsoBone.name = "spine";
  otherBone.name = "head";
  const mesh = new T.SkinnedMesh(g, material),
    model = new T.Group();
  model.add(torsoBone, otherBone, mesh);
  mesh.bind(new T.Skeleton([torsoBone, otherBone]));
  return model;
}
export function animalSignatures() {
  const out = {};
  for (const recipe of ANIMAL_APPEARANCES) {
    const library = createAnimalAppearanceLibrary(T),
      model = coatFixture(rigText(recipe.foundation, "coatName"));
    library.apply(model, recipe.id, recipe.foundation);
    const mesh = model.children.find((c) => c.isSkinnedMesh),
      hash = createHash("sha256");
    for (const [name, a] of Object.entries(mesh.geometry.attributes))
      hash.update(name).update(new Uint8Array(a.array.buffer, a.array.byteOffset, a.array.byteLength));
    hash.update(JSON.stringify([mesh.material.color.toArray(), mesh.material.vertexColors]));
    out[recipe.id] = hash.digest("hex");
    library.dispose();
  }
  return out;
}
