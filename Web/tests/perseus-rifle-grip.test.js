import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";
import { loadGeometry, sample } from "../../art/donor/probe.mjs";
import { setRigBones, rigBone } from "../src/rig-bones.js";
import { createRiflePose } from "../src/engine/rifle-pose.js";

const asset = (p) => fs.readFileSync(new URL("../public/assets/" + p, import.meta.url));
const models = JSON.parse(asset("manifest-hollow.json")).models,
  row = models.vagrant;
const world = (bone) => bone.getWorldPosition(new T.Vector3());

for (const key of ["player-rifle", "player-shotgun", "player-rocket-launcher"])
  test(`Perseus holds the ${key} two-handed: no throw, mount in the right hand, left hand on the foregrip`, async () => {
    const body = await loadGeometry(asset(row.url)),
      gun = await loadGeometry(asset(models[key].url)),
      model = body.scene,
      root = new T.Group();
    root.scale.setScalar(1.265 * row.scale);
    root.add(model);
    setRigBones(model, row);
    const pose = createRiflePose(model, { description: models[key], gltf: gun }),
      mixer = new T.AnimationMixer(model),
      rest = new Map();
    for (const clip of ["Idle", "Run"]) {
      sample(body, mixer, clip, 0.3);
      model.traverse((o) => o.isBone && rest.set(o, o.quaternion.clone()));
      for (const [name, time] of [
        ["Rifle_Aim", 0],
        ["Rifle_Fire", 0.05],
        ["Rifle_Reload", 1],
      ]) {
        pose.apply(name, time);
        root.updateMatrixWorld(true);
        const hand = world(rigBone(model, "hand")),
          at = pose.mount.getWorldPosition(new T.Vector3()),
          muzzle = world(pose.muzzle),
          left = world(model.getObjectByName("mixamorigLeftHand"));
        assert(at.distanceTo(hand) < 0.1, `${key} ${clip} ${name}: mount ${at.distanceTo(hand)} m from the hand bone`);
        assert(muzzle.z - at.z > 0.2, "barrel points along the facing direction");

        pose.restore();
        for (const [bone, q] of rest) assert(bone.quaternion.angleTo(q) < 1e-3, `${bone.name} restored`);
      }
    }
    pose.dispose();
  });

test("a throw while posing restores the arm bones", async () => {
  const body = await loadGeometry(asset(row.url)),
    gun = await loadGeometry(asset(models["player-rifle"].url)),
    model = body.scene,
    before = new Map();
  setRigBones(model, row);
  const pose = createRiflePose(model, { description: models["player-rifle"], gltf: gun });
  model.traverse((o) => o.isBone && before.set(o, o.quaternion.clone()));
  model.getObjectByName("mixamorigLeftHand").name = "gone"; // the right arm is already posed when the left arm fails
  assert.throws(() => pose.apply("Rifle_Aim", 0));
  for (const [bone, q] of before) assert(bone.quaternion.angleTo(q) < 1e-3, `${bone.name} restored after a throw`);
});
