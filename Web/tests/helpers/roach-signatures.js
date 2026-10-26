import * as T from "three";
import { ROACH_APPEARANCES, createRoachAppearanceLibrary } from "../../src/roach-appearance.js";

// The geometry arrays (position, normal, colour, ...) and the material per roach recipe, as the library writes them onto a synthetic roach mesh:
// 240 vertices at pseudo-random positions whose shell skin weight sweeps from 0 to 1, with an authored colour attribute. Used by the
// differential test that proves a data move changed no value.
function lcg(seed) {
  let s = seed;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function roachFixture() {
  const next = lcg(11),
    count = 240,
    positions = [],
    indices = [],
    weights = [],
    colours = [];
  for (let i = 0; i < count; i++) {
    positions.push((next() - 0.5) * 0.4, next() * 0.2, (next() - 0.5) * 0.7);
    const shell = i / (count - 1);
    weights.push(shell, 1 - shell, 0, 0);
    indices.push(0, 1, 0, 0);
    colours.push(0.5 + next() * 0.5, 0.5 + next() * 0.5, 0.5 + next() * 0.5);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("skinIndex", new T.Uint16BufferAttribute(indices, 4));
  g.setAttribute("skinWeight", new T.Float32BufferAttribute(weights, 4));
  g.setAttribute("color", new T.Float32BufferAttribute(colours, 3));
  g.setIndex(Array.from({ length: (count - 2) * 3 }, (_, k) => (k % 3) + Math.floor(k / 3)));
  const material = new T.MeshStandardMaterial({ color: 0xb08060 });
  material.name = "Worn rust-brown chitin";
  const shellBone = new T.Bone(),
    otherBone = new T.Bone();
  shellBone.name = "abdomen";
  otherBone.name = "head";
  const mesh = new T.SkinnedMesh(g, material),
    model = new T.Group();
  mesh.name = "ARM_Original_Infected_Ground_Roach";
  model.add(shellBone, otherBone, mesh);
  mesh.bind(new T.Skeleton([shellBone, otherBone]));
  return model;
}
export function roachSignatures() {
  const out = {};
  for (const recipe of ROACH_APPEARANCES) {
    const library = createRoachAppearanceLibrary(T),
      model = roachFixture();
    library.apply(model, recipe.id);
    const mesh = model.children.find((c) => c.isSkinnedMesh);
    out[recipe.id] = {
      attributes: Object.fromEntries(
        Object.entries(mesh.geometry.attributes).map(([name, a]) => [name, Array.from(a.array)]),
      ),
      material: { color: mesh.material.color.toArray(), vertexColors: mesh.material.vertexColors },
    };
    library.dispose();
  }
  return out;
}
