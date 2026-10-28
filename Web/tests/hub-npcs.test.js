import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { loadGeometry } from "../../art/donor/probe.mjs";
import { DonorMotion } from "../src/donor-motion.js";
import hubNpcs from "../src/data/hubNpcs.json" with { type: "json" };

const read = (p) => readFileSync(new URL("../public/assets/" + p, import.meta.url));
const manifest = JSON.parse(read("manifest-hollow.json"));
const record = JSON.parse(readFileSync(new URL("../../art/hub-npcs/assets.json", import.meta.url), "utf8")).bodies;
const sanitize = (name) => THREE.PropertyBinding.sanitizeNodeName(name);
// Phone budget: about the crowd bodies' 500 KB, at most 16 draws, the 106-joint rig only.
const SIZE_CAP = 600_000,
  DRAW_CAP = 16,
  JOINTS = 106;
const PHASES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.99];

test("three named hub NPCs: a quartermaster, a field medic and a radio operator, each with its own model", () => {
  assert.deepEqual(hubNpcs.npcs.map((n) => n.name), ["Marsh", "Dr. Okafor", "Reyes"]);
  assert.deepEqual(hubNpcs.npcs.map((n) => n.role), ["quartermaster", "field-medic", "radio-operator"]);
  for (const key of ["id", "name", "ref", "body"]) assert.equal(new Set(hubNpcs.npcs.map((n) => n[key])).size, 3, `${key} is unique`);
  assert.equal(hubNpcs.enabled, true);
  assert.equal(hubNpcs.offParam, "nonpcs");
});

test("only the three NPC files are in assets/npc and nothing else registers the npc/ folder", () => {
  assert.deepEqual(
    readdirSync(new URL("../public/assets/npc/", import.meta.url)).sort(),
    hubNpcs.npcs.map((n) => `${n.ref}.glb`).sort(),
  );
  const npcRows = Object.keys(manifest.models).filter((key) => manifest.models[key].url.startsWith("npc/"));
  assert.deepEqual(npcRows.sort(), hubNpcs.npcs.map((n) => n.ref).sort());
});

for (const npc of hubNpcs.npcs) {
  test(`${npc.name} (${npc.role}): deferred row, bytes and sha256 pinned in models and files, matches OpenTrident's record, phone-light`, async () => {
    const row = manifest.models[npc.ref],
      pin = manifest.files[npc.ref];
    assert(row && pin, "manifest model and file rows exist");
    assert.equal(row.rig, "mixamo-106", "106 rig only, never 65");
    assert.equal(row.deferred, true, "downloaded best effort, never blocks boot");
    assert.equal(row.url, pin.file);
    const bytes = read(row.url);
    const sha = createHash("sha256").update(bytes).digest("hex");
    assert.equal(bytes.length, row.bytes);
    assert.equal(bytes.length, pin.bytes);
    assert.equal(sha, row.sha256);
    assert.equal(sha, pin.sha256);
    assert(bytes.length < SIZE_CAP, `${bytes.length} bytes is over the phone budget`);
    const delivered = record.find((body) => body.id === npc.body);
    assert.equal(delivered.reduced_glb.sha256, sha, "the shipped file is the file OpenTrident delivered");
    assert.equal(delivered.licence, "CC0");
    for (const field of ["source", "licence", "assembly"]) assert(row.provenance[field], `provenance.${field}`);
    assert(row.scale >= 0.8 && row.scale <= 1.1 && row.stride > 0.6 && row.stride < 1.4);

    const gltf = await loadGeometry(bytes);
    const clips = new Set(gltf.animations.map((clip) => clip.name));
    assert(clips.has(npc.idleClip), "has an Idle clip");
    for (const clip of Object.values(row.clips)) assert(clips.has(clip), `row clip ${clip} exists`);
    let draws = 0,
      joints = 0;
    gltf.scene.traverse((node) => {
      assert(!/^(Layer_|Sword|Weapon)/.test(node.name), `no weapon node ${node.name}`);
      if (node.isMesh) draws += Array.isArray(node.material) ? node.material.length : 1;
      if (node.isSkinnedMesh) joints = Math.max(joints, node.skeleton.bones.length);
    });
    assert.equal(joints, JOINTS, "106-joint rig");
    assert(draws >= 1 && draws <= DRAW_CAP, `${draws} draws`);
  });

  // Plays the Idle through the engine's own DonorMotion (the path every appearance row takes), not just the clip's track list.
  test(`${npc.name}: Idle plays upright through DonorMotion (head above hips above feet) and the pose really moves`, async () => {
    const row = manifest.models[npc.ref];
    const gltf = await loadGeometry(read(row.url));
    const model = gltf.scene,
      root = new THREE.Group();
    root.add(model);
    const motion = new DonorMotion(root, model, gltf.animations, row);
    const bone = (name) => new THREE.Vector3().setFromMatrixPosition(model.getObjectByName(sanitize(name)).matrixWorld);
    const poses = [];
    for (const phase of PHASES) {
      motion.sample(row.clips.idle, phase);
      assert.equal(motion.currentClip, npc.idleClip);
      const [head, hips, left, right] = [row.headBone, "mixamorig:Hips", "mixamorig:LeftFoot", "mixamorig:RightFoot"].map(bone);
      assert(
        head.y > hips.y + 0.3 && hips.y > left.y + 0.3 && hips.y > right.y + 0.3,
        `${npc.ref} idle ${phase}: head ${head.y.toFixed(2)} hips ${hips.y.toFixed(2)} feet ${left.y.toFixed(2)}/${right.y.toFixed(2)}`,
      );
      assert(left.y > -0.05 && left.y < 0.25 && right.y > -0.05 && right.y < 0.25, `${npc.ref} feet stay on the ground`);
      model.traverse((node) => assert(node.matrixWorld.elements.every(Number.isFinite), `${node.name} stays finite`));
      poses.push([head, bone("mixamorig:Spine2"), bone("mixamorig:LeftHand"), bone("mixamorig:RightHand")]);
    }
    // The pose changes over time (head and hands travel at least 1 cm between phases) while the torso stays put (no drift, no fall),
    // and the loop closes: the last phase is close to the first.
    const travel = (i) => Math.max(...poses.map((p) => p[i].distanceTo(poses[0][i])));
    assert(travel(0) > 0.01, `${npc.ref} head moves (${travel(0).toFixed(3)} m)`);
    assert(Math.max(travel(2), travel(3)) > 0.01, `${npc.ref} hands move (${travel(2).toFixed(3)}, ${travel(3).toFixed(3)} m)`);
    assert(travel(1) < 0.1, `${npc.ref} spine stays in place (${travel(1).toFixed(3)} m)`);
    const seam = poses.at(-1).map((p, i) => p.distanceTo(poses[0][i]));
    assert(Math.max(...seam) < 0.25, `${npc.ref} idle loops without a jump (${seam.map((n) => n.toFixed(2))})`);
    // The engine's per-tick path (update) for a standing, unhurt entity selects this row's Idle but holds phase 0: DonorMotion does not
    // advance a standing human's idle clock by itself. The Hub wiring PR must drive sample(idle, phase) to make the NPC breathe.
    const standing = { kind: 0, hp: 100, dodgeUntil: 0, response: null, swing: null };
    for (const [time, dt] of [[1, 1 / 60], [2, 1 / 60], [3, 1 / 60]]) motion.update(standing, time, dt);
    assert.equal(motion.currentClip, npc.idleClip);
    assert.equal(motion.currentPhase, 0, "update() holds a standing human at idle phase 0");
    motion.dispose();
  });
}
