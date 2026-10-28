import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { loadGeometry } from "../../art/donor/probe.mjs";
import { DonorMotion } from "../src/donor-motion.js";

const read = (p) => readFileSync(new URL("../public/assets/" + p, import.meta.url));
const manifest = JSON.parse(read("manifest-hollow.json"));
const row = manifest.models["vagrant-106"];
const sanitize = (name) => THREE.PropertyBinding.sanitizeNodeName(name);

test("the vagrant on the 106 rig is a deferred appearance row that matches its file and leaves the player vagrant alone", () => {
  assert.equal(row.deferred, true, "no gameplay path selects it, so it must not load at start");
  assert.equal(row.motion, "donor-knife");
  assert.equal(row.url, manifest.files["vagrant-106"].file);
  const bytes = read(row.url);
  assert.equal(bytes.length, row.bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), row.sha256);
  assert.equal(manifest.files["vagrant-106"].sha256, row.sha256);
  // The player's own model row is the donor warrior on the hero rig: pistol, vest, finisher and flame code read its bone names.
  assert.equal(manifest.models.vagrant.url, "donor/warrior-phone.glb");
  assert.equal(manifest.models.vagrant.rig, "hero");
});

test("the vagrant body carries the hunter's clip set on the 106 bone names, with the machete in the hand socket", async () => {
  const [vagrant, hunter] = await Promise.all([
    loadGeometry(read(row.url)),
    loadGeometry(read(manifest.models["marked-hunter"].url)),
  ]);
  const hunterClips = new Map(hunter.animations.map((clip) => [clip.name, clip.duration]));
  const clips = new Map(vagrant.animations.map((clip) => [clip.name, clip.duration]));
  assert.deepEqual([...clips.keys()].sort(), [...hunterClips.keys()].sort(), "same 16 clip names as the hunter");
  for (const [name, duration] of hunterClips)
    assert(Math.abs(clips.get(name) - duration) < 1e-4, `clip ${name} keeps the hunter's duration`);
  for (const role of Object.values(row.clips)) assert(clips.has(role), `manifest clip ${role} exists in the file`);
  assert.equal(clips.has("Block"), false, "no shield clips");

  const scene = vagrant.scene;
  for (const bone of [row.upperBone, row.headBone, "mixamorig:Hips", "mixamorig:RightHand", "mixamorig:LeftFoot"])
    assert(scene.getObjectByName(sanitize(bone)), `bone ${bone}`);
  const skinned = [];
  scene.traverse((node) => node.isSkinnedMesh && skinned.push(node));
  assert(skinned.length >= 6, "body, clothing, boots, backpack and vest are skinned");
  for (const mesh of skinned) assert(mesh.skeleton.bones.length <= 19, "lean build: only the 19 weighted joints are skin joints");

  const grip = scene.getObjectByName(sanitize("fk_socket_hand_r"));
  const weapon = grip.getObjectByName("WeaponDrawn");
  assert.equal(weapon.parent, grip, "machete baked under the hand socket like the Pitborn cleaver");
  let weaponMeshes = 0;
  weapon.traverse((node) => node.isMesh && !node.isSkinnedMesh && weaponMeshes++);
  assert.equal(weaponMeshes, 2, "blade and handle are plain meshes");

  const nodes = new Set();
  scene.traverse((node) => nodes.add(node.name));
  for (const clip of vagrant.animations)
    for (const track of clip.tracks)
      assert(nodes.has(THREE.PropertyBinding.parseTrackName(track.name).nodeName), `${clip.name}: ${track.name} has a target`);
});

test("every clip of the vagrant plays through DonorMotion with finite poses and keeps the feet on the ground", async () => {
  const vagrant = await loadGeometry(read(row.url));
  const model = vagrant.scene;
  const root = new THREE.Group();
  root.add(model);
  const motion = new DonorMotion(root, model, vagrant.animations, row);
  for (const clip of vagrant.animations) {
    for (const phase of [0, 0.25, 0.5, 0.75, 0.99]) {
      motion.sample(clip.name, phase);
      model.traverse((node) => assert(node.matrixWorld.elements.every(Number.isFinite), `${clip.name} ${phase} ${node.name}`));
    }
  }
  motion.sample(row.clips.idle, 0);
  const feet = ["mixamorig:LeftFoot", "mixamorig:RightFoot"].map((name) => new THREE.Vector3().setFromMatrixPosition(model.getObjectByName(sanitize(name)).matrixWorld));
  const head = new THREE.Vector3().setFromMatrixPosition(model.getObjectByName(sanitize(row.headBone)).matrixWorld);
  for (const foot of feet) assert(foot.y < 0.2 && foot.y > -0.05, `idle ankle height ${foot.y.toFixed(3)} m`);
  assert(head.y > 1.35 && head.y < 1.9, `idle head bone height ${head.y.toFixed(3)} m`);
  motion.dispose();
});
