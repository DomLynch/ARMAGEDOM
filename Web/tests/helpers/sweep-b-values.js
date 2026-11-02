import { createHash } from "node:crypto";
import * as T from "three";
import { createFeralBodyShapeLibrary } from "../../src/feral-body-shapes.js";
import { allocateFaceRecipes } from "../../src/face-allocator.js";
import { FACE_APPEARANCE_VERSION, FACE_RECIPES } from "../../src/face-recipes.js";
import { territoryHomeStep } from "../../src/roach-territory.js";
import { resolveCreatureMoves, CREATURE_MOVES } from "../../src/creature-moves.js";
import { KNIFE_MOVES } from "../../src/donor/knife.js";
import { addPickupGlow } from "../../src/pickup-glow.js";

// Every value the five modules of sweep batch B compute, as plain data: the feral torso shapes on a synthetic coat mesh (one hash per shape),
// the face allocation for several rosters, the roach home step over a distance grid, the resolved creature moves, and the pickup contour
// (render order, stroke and colour, before and after a render pass, plus a hash of the hull normals). Used by the differential test that
// proves a data move changed no value.
function lcg(seed) {
  let s = seed;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function coatModel() {
  const next = lcg(5),
    count = 240,
    positions = [],
    indices = [],
    weights = [],
    colours = [];
  for (let i = 0; i < count; i++) {
    positions.push((next() - 0.5) * 0.6, next() * 0.5, (next() - 0.5) * 1.2);
    const torso = i / (count - 1);
    weights.push(torso, 1 - torso, 0, 0);
    indices.push(0, 1, 0, 0);
    colours.push(1, 1, 1);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("skinIndex", new T.Uint16BufferAttribute(indices, 4));
  g.setAttribute("skinWeight", new T.Float32BufferAttribute(weights, 4));
  g.setAttribute("color", new T.Float32BufferAttribute(colours, 3));
  const material = new T.MeshStandardMaterial({ vertexColors: true });
  material.name = "Weathered brindle coat";
  const torsoBone = new T.Bone(),
    other = new T.Bone();
  torsoBone.name = "spine";
  other.name = "head";
  const mesh = new T.SkinnedMesh(g, material),
    model = new T.Group();
  model.add(torsoBone, other, mesh);
  mesh.bind(new T.Skeleton([torsoBone, other]));
  return model;
}
const attempt = (fn) => {
  try {
    return fn();
  } catch (error) {
    return "throws " + error.constructor.name;
  }
};
const hashOf = (g) => {
  const h = createHash("sha256");
  for (const [name, a] of Object.entries(g.attributes))
    h.update(name).update(new Uint8Array(a.array.buffer, a.array.byteOffset, a.array.byteLength));
  return h.digest("hex");
};
export function sweepBValues() {
  const out = { feral: {}, faces: {}, territory: {}, moves: null, glow: {} };
  for (const id of ["dog-gaunt-hound", "dog-stocky-yard", "dog-unknown"]) {
    const library = createFeralBodyShapeLibrary(),
      model = coatModel();
    out.feral[id] = attempt(() => {
      const handle = library.apply(model, id),
        hash = hashOf(model.children.find((c) => c.isSkinnedMesh).geometry);
      handle.dispose();
      return hash;
    });
    library.dispose();
  }
  const library = { version: FACE_APPEARANCE_VERSION, recipes: FACE_RECIPES };
  for (const area of ["westminster", "east", "south", "area7"])
    for (const n of [1, 6, 9, 14, 50, 51])
      out.faces[`${area}/${n}`] = attempt(() => [
        ...allocateFaceRecipes(
          area,
          Array.from({ length: n }, (_, i) => `${area}-roamer-${i + 1}`),
          library,
        ),
      ]);
  const params = { pursuitScope: "home", homeLeash: 5 };
  for (const returning of [true, false])
    for (const alerted of [true, false])
      for (const homeDistance of [0, 0.1, 0.19999, 0.2, 0.20001, 0.5, 3])
        for (const playerHomeDistance of [1, 6])
          out.territory[`${returning}/${alerted}/${homeDistance}/${playerHomeDistance}`] = territoryHomeStep(params, {
            alive: true,
            returning,
            alerted,
            homeDistance,
            playerHomeDistance,
            returnPathClear: true,
          });
  out.moves = {
    all: JSON.parse(JSON.stringify(CREATURE_MOVES)),
    knifeRef: attempt(() =>
      resolveCreatureMoves({ probe: { extends: ["knife:" + Object.keys(KNIFE_MOVES)[0]] } }, KNIFE_MOVES),
    ),
    badRef: attempt(() => resolveCreatureMoves({ probe: { extends: ["knife-nope", "missing"] } }, KNIFE_MOVES)),
  };
  for (const count of [1, 3]) {
    const geometry = new T.CylinderGeometry(0.018, 0.019, 0.11, 8),
      mesh = new T.InstancedMesh(geometry, new T.MeshStandardMaterial({ color: 0xb49a65 }), count);
    mesh.renderOrder = 7;
    const glow = addPickupGlow(mesh),
      before = {
        order: glow.halo.renderOrder,
        stroke: glow.halo.material.uniforms.stroke.value,
        colour: glow.halo.material.uniforms.color.value.getHex(),
        hull: hashOf(glow.halo.geometry),
      },
      renderer = { getCurrentViewport: (v) => v.set(0, 0, 800, 600), getPixelRatio: () => 3 };
    glow.halo.onBeforeRender(renderer);
    const afterPlain = glow.halo.material.uniforms.stroke.value;
    glow.halo.userData.strokeScale = 0.5;
    glow.halo.onBeforeRender(renderer);
    out.glow[count] = { before, afterPlain, afterScaled: glow.halo.material.uniforms.stroke.value };
    glow.dispose();
  }
  return out;
}
