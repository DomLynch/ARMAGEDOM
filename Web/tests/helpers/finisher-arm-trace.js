import fs from "node:fs";
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { prepareArmSever } from "../../src/engine/finisher-arm.js";

const raw = fs.readFileSync(new URL("../../public/assets/hollow-scavenger/left-arm-parts.glb", import.meta.url));
const asset = await new GLTFLoader()
  .setMeshoptDecoder(MeshoptDecoder)
  .parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), "");
const round = (n) => Math.round(n * 1e9) / 1e9;

function arm(options) {
  const model = clone(asset.scene),
    original = model.getObjectByName("Prepared_left_arm_body");
  original.name = "Hollow_body_and_worn_trousers";
  original.children.find((n) => n.material?.name === "Opaque arm wound - muscle and bone").removeFromParent();
  model.getObjectByName("Prepared_detached_left_arm").removeFromParent();
  const root = new T.Group(),
    scene = new T.Scene();
  root.add(model);
  root.position.set(2, 0, -1);
  root.scale.setScalar(1.6);
  scene.add(root);
  root.updateWorldMatrix(true, true);
  return { prepared: prepareArmSever({ model, asset, scene, isBlocked: () => false, ...options }), scene };
}

// Detaches the arm and steps its toss physics: launch velocity and spin, gravity, ground bounce, wall stop, lifetime.
export function finisherArmTrace() {
  const out = {};
  const cases = {
    free: { direction: { x: 1, z: 0 }, frames: 90, dt: 1 / 60 },
    diagonal: { direction: { x: 0.6, z: -0.8 }, frames: 90, dt: 1 / 30 },
    laggy: { direction: { x: -1, z: 0 }, frames: 40, dt: 0.5 },
    blocked: { direction: { x: 1, z: 0 }, frames: 90, dt: 1 / 60, blocked: true },
    lifetime: { direction: { x: 1, z: 0 }, frames: 5, dt: 1 / 60, ages: [5.9, 6, 7] },
    groundY: { direction: { x: 0, z: 1 }, frames: 120, dt: 1 / 60, groundY: 0.4 },
  };
  for (const [name, c] of Object.entries(cases)) {
    const { prepared, scene } = arm({ groundY: c.groundY ?? 0, isBlocked: () => !!c.blocked });
    const trail = [{ started: prepared.start(c.direction), radius: round(prepared.stats().radius) }];
    for (let f = 0; f < c.frames; f++) {
      prepared.update(c.ages ? c.ages[f % c.ages.length] : (f + 1) * c.dt, c.dt);
      const p = prepared.container.position,
        q = prepared.container.quaternion;
      trail.push([p.x, p.y, p.z, q.x, q.y, q.z, q.w].map(round));
    }
    trail.push({ expired: prepared.stats().expired, attached: prepared.container.parent === scene });
    out[name] = trail;
    prepared.dispose();
  }
  return out;
}
