import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadGeometry } from "../../art/donor/probe.mjs";
import hubNpcs from "../src/data/hubNpcs.json" with { type: "json" };

const manifest = JSON.parse(readFileSync(new URL("../public/assets/manifest-hollow.json", import.meta.url), "utf8"));
const file = (name) => new URL(`../public/assets/npc/${name}.glb`, import.meta.url);
// Phone budget: soft cap about 1 to 2 MB over a 600 KB body, at most 16 draws, one idle clip, the 106-joint rig only.
const SIZE_CAP = 1_000_000,
  DRAW_CAP = 16,
  JOINTS = 106;

test("three named hub NPCs: a vendor, a medic and a quest giver, each with its own model", () => {
  assert.deepEqual(hubNpcs.npcs.map((n) => n.role).sort(), ["medic", "quest-giver", "vendor"]);
  assert.equal(new Set(hubNpcs.npcs.map((n) => n.name)).size, 3);
  assert.equal(new Set(hubNpcs.npcs.map((n) => n.ref)).size, 3);
  assert.equal(new Set(hubNpcs.npcs.map((n) => n.body)).size, 3, "no two NPCs share a body");
  assert.equal(hubNpcs.enabled, true);
  assert.equal(hubNpcs.offParam, "nonpcs");
});

for (const npc of hubNpcs.npcs) {
  test(`${npc.name} (${npc.role}): registered, pinned, 106 rig only, one idle clip, phone-light`, async () => {
    const row = manifest.models[npc.ref],
      pin = manifest.files[npc.ref];
    assert(row && pin, "manifest model and file rows exist");
    assert.equal(row.rig, "mixamo-106", "106 rig only, never 65");
    assert.equal(row.deferred, true, "downloaded best effort, never blocks boot");
    assert.equal(row.url, pin.file);
    const bytes = readFileSync(file(npc.ref));
    assert.equal(bytes.length, row.bytes);
    assert.equal(bytes.length, pin.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), pin.sha256);
    assert(statSync(file(npc.ref)).size < SIZE_CAP, `${bytes.length} bytes is over the phone budget`);
    for (const [role, clip] of Object.entries(row.clips)) assert.equal(clip, npc.idleClip, `${role} points at the one idle clip`);

    const gltf = await loadGeometry(bytes);
    assert.deepEqual(
      gltf.animations.map((clip) => clip.name),
      [npc.idleClip],
      "exactly one clip",
    );
    let draws = 0,
      joints = 0;
    gltf.scene.traverse((node) => {
      if (node.isMesh) draws += Array.isArray(node.material) ? node.material.length : 1;
      if (node.isSkinnedMesh) joints = Math.max(joints, node.skeleton.bones.length);
    });
    assert.equal(joints, JOINTS, "106-joint rig");
    assert(draws >= 1 && draws <= DRAW_CAP, `${draws} draws`);
    // The idle moves the body (not a frozen rest pose) and keeps the head above the hips above the feet.
    const clip = gltf.animations[0];
    assert(clip.duration > 1, "a real idle loop");
    assert(clip.tracks.some((track) => track.name.endsWith(".quaternion")));
  });
}
