import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { equipDonorPlayer } from "../src/donor-motion.js";

const manifest = JSON.parse(readFileSync(new URL("../public/assets/manifest-hollow.json", import.meta.url), "utf8")),
  swap = manifest.playerSwap,
  row = manifest.models[swap.use];
function glbJson(url) {
  const bytes = readFileSync(url);
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
}
const body = glbJson(new URL("../public/assets/" + row.url, import.meta.url));

test("?player=perseus swaps only the named fields of the vagrant row, and the rig stays hero", () => {
  assert.equal(swap.model, "vagrant");
  assert.ok(!swap.fields.includes("rig") && !swap.fields.includes("equipment") && !swap.fields.includes("motion"));
  for (const field of ["url", "clips", "handBone", "upperArmBone", "foreArmBone", "torsoBone", "upperBone", "headBone"])
    assert.ok(swap.fields.includes(field) && row[field] !== undefined, field);
});
test("every clip and bone the Perseus row names exists in its GLB", () => {
  const clips = new Set(body.animations.map((a) => a.name)),
    nodes = new Set(body.nodes.map((n) => n.name));
  for (const clip of Object.values(row.clips)) assert.ok(clips.has(clip), "clip " + clip);
  for (const field of ["handBone", "upperArmBone", "foreArmBone", "torsoBone", "upperBone", "headBone"])
    assert.ok(nodes.has(row[field]), field + " " + row[field]);
  assert.ok(body.skins.length >= 1);
  for (const skin of body.skins) assert.equal(skin.joints.length, 106);
});
test("weapon-file clips that name hero bones do not shadow the body's own clip", () => {
  const scene = new THREE.Group(),
    hand = new THREE.Bone();
  hand.name = "fk_socket_hand_r";
  scene.add(hand);
  const part = new THREE.Group(),
    blade = new THREE.Group();
  blade.name = "WeaponDrawn";
  part.add(blade);
  const track = (node) => new THREE.QuaternionKeyframeTrack(node + ".quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    heroClip = new THREE.AnimationClip("Heavy", 1, [track("spine_01")]),
    fitClip = new THREE.AnimationClip("Fits", 1, [track("fk_socket_hand_r")]),
    own = new THREE.AnimationClip("Heavy", 1, [track("fk_socket_hand_r")]);
  scene.userData.rigBones = { hand: "fk_socket_hand_r" };
  const out = equipDonorPlayer({ scene, animations: [own] }, { scene: part, animations: [heroClip, fitClip] });
  assert.deepEqual(out.animations.map((c) => c.name).sort(), ["Fits", "Heavy"]);
  assert.equal(out.animations.find((c) => c.name === "Heavy"), own);
});
