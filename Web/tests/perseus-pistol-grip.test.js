import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";
import { loadGeometry, sample } from "../../art/donor/probe.mjs";
import { setRigBones, rigBone } from "../src/rig-bones.js";
import { attachPistol, applyPistolAim } from "../src/pistol-pose.js";

const asset = (p) => fs.readFileSync(new URL("../public/assets/" + p, import.meta.url));
const row = JSON.parse(asset("manifest-hollow.json")).models.vagrant;

test("Perseus pistol mount sits in the right hand while aiming, with the row's finger grip applied", async () => {
  const body = await loadGeometry(asset(row.url)),
    pistol = await loadGeometry(asset("pistol/pistol.glb")),
    model = body.scene,
    root = new T.Group();
  root.scale.setScalar(1.265 * row.scale);
  root.add(model);
  setRigBones(model, row);
  const mount = attachPistol(model, pistol.scene),
    mixer = new T.AnimationMixer(model);
  for (const clip of ["Idle", "Run"]) {
    sample(body, mixer, clip, 0.3);
    applyPistolAim(model, mount);
    root.updateMatrixWorld(true);
    const hand = rigBone(model, "hand").getWorldPosition(new T.Vector3()),
      at = mount.getWorldPosition(new T.Vector3());
    assert(at.distanceTo(hand) < 0.08, `${clip}: mount ${at.distanceTo(hand)} m from the hand bone`);
    const muzzle = mount.getObjectByName("Muzzle").getWorldPosition(new T.Vector3());
    assert(muzzle.z - hand.z > 0.05, "barrel points along the facing direction");
  }
  const curled = model.getObjectByName("mixamorigRightHandMiddle2");
  assert(curled.quaternion.angleTo(new T.Quaternion()) > 0.5, "fingers curl around the grip");
});
