import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { equipDonorPlayer } from "../src/donor-motion.js";

const manifest = JSON.parse(readFileSync(new URL("../public/assets/manifest-hollow.json", import.meta.url), "utf8")),
  row = manifest.models.vagrant;
function glbJson(url) {
  const bytes = readFileSync(url);
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
}
const body = glbJson(new URL("../public/assets/" + row.url, import.meta.url));

test("the player row is the Perseus body on the hero rig id, with no flag or swap block left", () => {
  assert.equal(manifest.playerSwap, undefined);
  assert.equal(manifest.models["perseus-106"], undefined);
  assert.equal(row.url, "appearances/perseus-106.glb");
  assert.equal(row.rig, "hero");
  assert.ok(row.equipment);
  for (const field of ["clips", "handBone", "upperArmBone", "foreArmBone", "torsoBone", "upperBone", "headBone"])
    assert.ok(row[field] !== undefined, field);
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
test("the hero rig (no named hand bone) keeps every weapon-file clip", () => {
  const scene = new THREE.Group(),
    hand = new THREE.Bone();
  hand.name = "hand_r";
  scene.add(hand);
  const part = new THREE.Group(),
    blade = new THREE.Group();
  blade.name = "WeaponDrawn";
  part.add(blade);
  const clip = new THREE.AnimationClip("Heavy", 1, [new THREE.QuaternionKeyframeTrack("elsewhere.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])]);
  assert.deepEqual(equipDonorPlayer({ scene, animations: [] }, { scene: part, animations: [clip] }).animations.map((c) => c.name), ["Heavy"]);
});
