import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { rigBone, setRigBones } from "../src/rig-bones.js";

const rig = (names) => {
  const root = new THREE.Group();
  for (const n of names) {
    const b = new THREE.Bone();
    b.name = n;
    root.add(b);
  }
  return root;
};

test("hero rig resolves by default with no manifest fields", () => {
  const m = rig(["hand_r", "upperarm_r", "lowerarm_r"]);
  setRigBones(m, {});
  assert.equal(rigBone(m, "hand").name, "hand_r");
  assert.equal(rigBone(m, "upperArm").name, "upperarm_r");
  assert.equal(rigBone(m, "foreArm").name, "lowerarm_r");
  assert.equal(rigBone(rig(["hand_r"]), "hand").name, "hand_r");
  assert.equal(rigBone(rig(["spine_01"]), "torso").name, "spine_01");
});

test("manifest row names win, colon-stripped like three does on load", () => {
  const m = rig(["mixamorigRightHand", "mixamorigRightArm", "mixamorigRightForeArm"]);
  setRigBones(m, { handBone: "mixamorig:RightHand", upperArmBone: "mixamorig:RightArm", foreArmBone: "mixamorig:RightForeArm" });
  assert.equal(rigBone(m, "hand").name, "mixamorigRightHand");
  assert.equal(rigBone(m, "foreArm").name, "mixamorigRightForeArm");
});
