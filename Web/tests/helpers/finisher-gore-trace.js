import * as T from "three";
import { createFinisherGore } from "../../src/engine/finisher-gore.js";

const round = (n) => Math.round(n * 1e9) / 1e9;
const vec = (v) => (v ? [v.x, v.y, v.z].map(round) : null);

// One skinned sphere on a spine bone, as tests/finisher-gore.test.js builds it; `weights(i)` gives each vertex's [bone, weight] pairs.
function build({ camera: cameraAt, weights, transform }) {
  const root = new T.Group(),
    model = new T.Group(),
    spine = new T.Bone(),
    other = new T.Bone();
  spine.name = "spine_02";
  other.name = "hand_l";
  model.add(spine, other);
  root.add(model);
  const g = new T.SphereGeometry(0.22, 16, 12);
  g.translate(0, 1, 0);
  const n = g.attributes.position.count,
    ix = new Uint16Array(n * 4),
    w = new Float32Array(n * 4);
  for (let i = 0; i < n; i++)
    weights(i).forEach(([bone, weight], k) => {
      ix[i * 4 + k] = bone;
      w[i * 4 + k] = weight;
    });
  g.setAttribute("skinIndex", new T.Uint16BufferAttribute(ix, 4));
  g.setAttribute("skinWeight", new T.Float32BufferAttribute(w, 4));
  const material = new T.MeshStandardMaterial({ color: 0xaabbcc }),
    mesh = new T.SkinnedMesh(g, material);
  mesh.name = "Actual torso receiver";
  model.add(mesh);
  mesh.bind(new T.Skeleton([spine, other]));
  const camera = new T.PerspectiveCamera();
  camera.position.set(...cameraAt);
  camera.lookAt(0, 1, 0);
  transform?.(root, spine);
  root.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  return {
    root,
    model,
    camera,
    gore: createFinisherGore({ root, model, rig: "hollow-scavenger", camera }),
    dispose: () => [g, material],
  };
}

const full = () => [[0, 1]];
// Everything finisher-gore picks from its numbers: how many samples each zone keeps, the receiver, anchors, ray count.
export function finisherGoreTrace() {
  const cases = {
    front: { camera: [0, 2, 5], weights: full },
    behind: { camera: [0, 2, -5], weights: full },
    low: { camera: [0, 0.2, 5], weights: full },
    side: { camera: [4, 1.2, 1], weights: full },
    half: {
      camera: [0, 2, 5],
      weights: (i) => [
        [0, 0.5],
        [1, 0.5],
      ],
    },
    justBelowHalf: {
      camera: [0, 2, 5],
      weights: () => [
        [0, 0.49],
        [1, 0.51],
      ],
    },
    sparse: { camera: [0, 2, 5], weights: (i) => (i % 17 === 0 ? [[0, 1]] : [[1, 1]]) },
    // Coarse sampling finds 14 of these 42 vertices: just under a quarter of the 64-sample budget, so the dense refill runs.
    nearlySparse: { camera: [0, 2, 5], weights: (i) => (i < 42 ? [[0, 1]] : [[1, 1]]) },
    posed: {
      camera: [1, 1.5, 4],
      weights: full,
      transform: (root, spine) => {
        spine.rotation.z = 0.5;
        root.scale.set(1.3, 0.9, 1.6);
        root.position.set(2, 0.1, -3);
        root.rotation.y = 0.7;
      },
    },
    nearGround: {
      camera: [0, 1.5, 4],
      weights: full,
      transform: (root) => root.position.set(0, -0.9, 0),
    },
  };
  const out = {};
  for (const [name, spec] of Object.entries(cases))
    for (const recipeId of ["pistol-directional", "cutting-native-collapse"]) {
      const f = build(spec),
        entity = { id: 1, hp: 0, facing: { x: 0, z: 1 }, finisher: { recipeId, impactDirection: { x: 0, z: 1 } } };
      if (!f.gore) {
        out[`${name}:${recipeId}`] = null;
        continue;
      }
      const ok = f.gore.update(entity),
        s = f.gore.stats(),
        a = f.gore.impactAnchors();
      out[`${name}:${recipeId}`] = {
        ok,
        samples: s.preparedSamples,
        receiver: s.receiver,
        visible: s.visible,
        rays: s.visibilityRays,
        anchors: a && {
          body: vec(a.body),
          head: vec(a.head),
          surface: a.gore?.surface && { position: vec(a.gore.surface.position), normal: vec(a.gore.surface.normal) },
        },
      };
      f.gore.dispose();
    }
  return out;
}
