import { sanitizeBoneName } from "./rig-bones.js";

const CORNERS = ["a", "b", "c"].length; // the corners of a triangle

// Bite receivers for a swapped player body (a manifest row with `bodyContact`), built from that body's own skinned meshes and bones.
// The row names the bones: `parts` maps a body part to bone groups (one group per side), `receivers` lists the parts each creature
// receiver covers, `weightMin` is the share of a corner's skin weight a part's bones must hold to bind it. The hero keeps its
// recorded face bindings (rat-data/foot-bindings.json, dog-data/receiver-append.json, creature `contact.calfFaces`).
function skinnedMeshes(model) {
  const meshes = [];
  model.traverse((o) => {
    if (o.isSkinnedMesh && o.geometry.index && o.geometry.attributes.skinIndex && o.geometry.attributes.skinWeight)
      meshes.push(o);
  });
  return meshes;
}

// Vertices of `mesh` that put at least `weightMin` of their skin weight on the named bones.
function heavyVertices(mesh, bones, weightMin) {
  const names = new Set(bones.map(sanitizeBoneName)),
    held = new Set(mesh.skeleton.bones.flatMap((b, i) => (names.has(sanitizeBoneName(b.name)) ? [i] : []))),
    skin = mesh.geometry.attributes.skinIndex,
    weights = mesh.geometry.attributes.skinWeight,
    found = new Set();
  for (let i = 0; i < skin.count; i++) {
    let sum = 0;
    for (let j = 0; j < skin.itemSize; j++) if (held.has(skin.getComponent(i, j))) sum += weights.getComponent(i, j);
    if (sum >= weightMin) found.add(i);
  }
  return found;
}

export function createBodyContact(model, spec) {
  const meshes = skinnedMeshes(model),
    parts = new Map();
  function part(name) {
    if (parts.has(name)) return parts.get(name);
    const groups = spec.parts[name];
    if (!groups) throw Error("Body contact has no part " + name);
    const faces = [],
      sides = [];
    for (const mesh of meshes) {
      const index = mesh.geometry.index;
      for (const bones of groups) {
        const vertices = heavyVertices(mesh, bones, spec.weightMin),
          used = new Set();
        for (let face = 0; face < index.count / CORNERS; face++) {
          const row = Array.from({ length: CORNERS }, (_, k) => index.getX(face * CORNERS + k));
          if (row.every((i) => vertices.has(i))) {
            faces.push({ runtimeName: mesh.name, face, vertices: row });
            for (const i of row) used.add(i);
          }
        }
        // An even spread of the side's vertices: their mean sits inside the limb, so a bite aimed at it passes the surface.
        const every = Math.max(1, Math.ceil(used.size / spec.goalSamples));
        if (used.size) sides.push({ mesh, bones, sample: [...used].filter((_, n) => n % every === 0) });
      }
    }
    if (!faces.length) throw Error("Body contact part " + name + " binds no faces");
    const built = { faces, sides };
    parts.set(name, built);
    return built;
  }
  // The recorded-binding shape createRatBiteReceiver takes, merged over the named parts without repeating a face.
  function bindingsOf(names) {
    const bindings = [],
      seen = new Set();
    for (const name of names)
      for (const { runtimeName, face, vertices } of part(name).faces) {
        const key = runtimeName + ":" + face;
        if (seen.has(key)) continue;
        seen.add(key);
        let binding = bindings.find((b) => b.runtimeName === runtimeName);
        if (!binding) bindings.push((binding = { runtimeName, faceBindings: [] }));
        binding.faceBindings.push({ face, vertices });
      }
    return bindings;
  }
  return {
    // Receiver bindings for a creature receiver kind (foot, dog, salamander, wolf).
    bindings(kind) {
      const names = spec.receivers[kind];
      if (!names) throw Error("Body contact has no receiver " + kind);
      return bindingsOf(names);
    },
    // Faces a creature reaches for, by the creature's contact part.
    goalFaces: (name) => part(name).faces,
    // Where a creature reaches on the part, in render space: per side, every sampled vertex of its posed surface moved `depth` of the way
    // to the side's mean (0 stays on the surface, 1 is the limb axis). `shown(mesh)` skips hidden meshes; `vector()` makes a Vector3,
    // as this file imports no renderer. The skeleton is brought up to the current pose first: the renderer does that once a frame.
    reachPoints(name, depth, shown, vector) {
      const found = [];
      for (const { mesh, sample } of part(name).sides) {
        if (!shown(mesh)) continue;
        mesh.skeleton.update();
        const points = sample.map((i) => mesh.getVertexPosition(i, vector()).applyMatrix4(mesh.matrixWorld)),
          centre = points.reduce((sum, p) => sum.add(p), vector()).multiplyScalar(1 / points.length);
        for (const p of points) found.push(p.lerp(centre, depth));
      }
      return found;
    },
    // The extreme vertices (each axis, both signs) of every side of the part, weighted at least `weightMin` on its bones: where a rat heads.
    footPoints(name, weightMin) {
      const points = [];
      const { faces, sides } = part(name);
      for (const { mesh, bones } of sides) {
        const g = mesh.geometry,
          bound = new Set(faces.filter((f) => f.runtimeName === mesh.name).flatMap((f) => f.vertices)),
          heavy = heavyVertices(mesh, bones, weightMin),
          valid = [...bound].filter((i) => heavy.has(i)),
          chosen = new Set();
        for (const axis of ["X", "Y", "Z"])
          for (const sign of [-1, 1]) {
            let best = null;
            for (const i of valid)
              if (
                best === null ||
                sign * g.attributes.position["get" + axis](i) > sign * g.attributes.position["get" + axis](best)
              )
                best = i;
            if (best !== null) chosen.add(best);
          }
        for (const i of chosen) points.push({ mesh, i });
      }
      return points;
    },
  };
}
