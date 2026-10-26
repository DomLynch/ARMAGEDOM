import fs from "node:fs";
import { createHash } from "node:crypto";
import * as T from "three";
import { loadGeometry } from "../../../art/donor/probe.mjs";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { equipDonorPlayer, DonorMotion } from "../../src/donor-motion.js";
import { CrookedHollowMotion, crookedPhase } from "../../src/crooked-hollow.js";

// Everything crooked-hollow.js computes, as numbers: the gait curve, and the bone transforms after every pose the module can write
// (the five gaits at nine phases through sample(), and 90 moving update() steps that drive the walk cycle accumulator).
// Used by the differential test that proves a data move changed no value.
const bodyBytes = fs.readFileSync(
  new URL("../../public/assets/hollow-scavenger/hollow-scavenger.glb", import.meta.url),
);
const knifeBytes = fs.readFileSync(new URL("../../public/assets/hollow-scavenger/knife.glb", import.meta.url));
const description = JSON.parse(
  fs.readFileSync(new URL("../../public/assets/hollow-scavenger/manifest.json", import.meta.url)),
).models["hollow-scavenger"];
async function make() {
  const body = await loadGeometry(bodyBytes),
    knife = await loadGeometry(knifeBytes),
    source = equipDonorPlayer({ scene: clone(body.scene), animations: body.animations }, knife),
    root = new T.Group();
  root.add(source.scene);
  const native = new DonorMotion(root, source.scene, source.animations, description);
  return { root, source, native, motion: new CrookedHollowMotion(native) };
}
function boneHash(source) {
  const hash = createHash("sha256");
  source.scene.traverse((n) => {
    if (n.isBone)
      hash.update(JSON.stringify([n.name, n.position.toArray(), n.quaternion.toArray(), n.scale.toArray()]));
  });
  return hash.digest("hex");
}
export async function crookedSignatures() {
  const out = { gait: [], samples: {}, updates: [] };
  for (let i = -4; i <= 44; i++) out.gait.push(crookedPhase(i / 40));
  const a = await make();
  for (const clip of ["HollowIdle", "HollowWalk", "Run", "StrafeLeft", "StrafeRight"])
    for (const phase of [0, 0.1, 0.25, 0.4, 0.5, 0.65, 0.8, 0.95, 0.999]) {
      a.motion.sample(clip, phase);
      out.samples[`${clip}/${phase}`] = boneHash(a.source);
    }
  a.motion.dispose();
  const b = await make(),
    entity = { hp: 40 };
  for (let i = 0; i < 90; i++) {
    b.root.position.z += 0.031;
    b.motion.update(entity, (i + 1) / 60, 1 / 60);
    out.updates.push(boneHash(b.source));
  }
  out.finalCycle = b.motion.cycle;
  b.motion.dispose();
  return out;
}
