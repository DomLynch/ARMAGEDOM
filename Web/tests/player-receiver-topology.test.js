import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadGeometry } from "../../art/donor/probe.mjs";
import { createRatBiteReceiver } from "../src/rat-contact.js";
import { wolfBodyReceiverBindings } from "../src/wolf-native.js";

// The creature receivers (rat, dog, salamander, wolf) bind to faces of the PLAYER's real skinned meshes by face number and vertex id.
// createRatBiteReceiver throws "Lower-leg topology mismatch" when index.getX(face * 3 + k) is not the recorded vertex, so any change
// to the player GLB that reorders triangles, rotates a triangle's corners or renumbers vertices must fail here, not at runtime.
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url))),
  assets = new URL("../public/assets/", import.meta.url),
  hollow = read("../public/assets/manifest-hollow.json"),
  footBindings = read("../src/rat-data/foot-bindings.json"),
  dogAppend = read("../src/dog-data/receiver-append.json"),
  playerFile = hollow.files["player-phone"].file;

async function player() {
  const bytes = readFileSync(new URL(playerFile, assets));
  return { bytes, gltf: await loadGeometry(bytes) };
}

test("foot-bindings.json is pinned to the shipped player GLB", async () => {
  const { bytes } = await player();
  assert.equal(createHash("sha256").update(bytes).digest("hex"), footBindings.playerSha256);
  assert.equal(bytes.length, hollow.files["player-phone"].bytes);
});

test("the rat foot, dog append and salamander calf receivers build against the real player meshes", async () => {
  const { gltf } = await player();
  gltf.scene.updateMatrixWorld(true);
  assert.ok(createRatBiteReceiver(gltf.scene, footBindings.bindings), "foot receiver");
  const dog = footBindings.bindings.map((b) => ({
    ...b,
    faceBindings: [...b.faceBindings, ...dogAppend.filter((f) => f.runtimeName === b.runtimeName).map(({ face, vertices }) => ({ face, vertices }))],
  }));
  assert.ok(dogAppend.length > 0);
  assert.ok(createRatBiteReceiver(gltf.scene, dog), "dog receiver");
  const calves = Object.entries(hollow.models).filter(([, m]) => m.contact?.calfFaces);
  assert.ok(calves.length > 0);
  for (const [key, m] of calves) {
    const bindings = [];
    for (const { runtimeName, face, vertices } of m.contact.calfFaces) {
      let binding = bindings.find((b) => b.runtimeName === runtimeName);
      if (!binding) bindings.push((binding = { runtimeName, faceBindings: [] }));
      binding.faceBindings.push({ face, vertices });
    }
    assert.ok(createRatBiteReceiver(gltf.scene, bindings), `${key} calf receiver`);
  }
});

test("the wolf body receiver builds against the real player skin", async () => {
  const { gltf } = await player();
  gltf.scene.updateMatrixWorld(true);
  const bindings = wolfBodyReceiverBindings(gltf.scene);
  assert.ok(bindings[0].faceBindings.length > 0);
  assert.ok(createRatBiteReceiver(gltf.scene, bindings));
});

test("a rotated triangle in a bound face is rejected as a topology mismatch (the check can fail)", async () => {
  const { gltf } = await player();
  gltf.scene.updateMatrixWorld(true);
  const row = footBindings.bindings[0],
    mesh = gltf.scene.getObjectByName(row.runtimeName),
    face = row.faceBindings.find((f) => new Set(f.vertices).size === 3),
    [a, b, c] = face.vertices,
    index = mesh.geometry.index;
  index.setX(face.face * 3, b);
  index.setX(face.face * 3 + 1, c);
  index.setX(face.face * 3 + 2, a);
  assert.throws(() => createRatBiteReceiver(gltf.scene, footBindings.bindings), /topology/);
});
