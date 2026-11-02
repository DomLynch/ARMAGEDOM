// Outside review (perf): the particle pool re-sent its whole instance buffer on every tickPool pass, several a frame, even when empty.
// An empty pool now uploads once more after its last particle ends (to park every instance) and then not at all.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createEffects } from "../src/effects.js";

const actor = { id: 0, pos: { x: 0, z: 0 }, facing: { x: 0, z: 1 }, hp: 150, combatScale: 1.265 };
const world = () => {
  const camera = new THREE.PerspectiveCamera(35, 2, 0.1, 100);
  camera.position.set(0, 10, 20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { camera, areaId: "westminster", lineClear: () => true, toRender: (p, h = 0) => new THREE.Vector3(p.x, h, -p.z) };
};
const fresh = () => {
  const scene = new THREE.Scene(),
    marker = { hidden: true, style: {}, textContent: "" },
    fx = createEffects(scene, world(), null, () => null, { getView: () => undefined, hitMarker: marker });
  const mesh = scene.getObjectByName("Combat pooled particles");
  return { fx, mesh };
};

test("an idle particle pool stops re-uploading its instance buffer; a burst uploads while it lives, then once more and stops", () => {
  const { fx, mesh } = fresh();
  assert.ok(mesh, "the pooled particle mesh exists");
  fx.advance(0.016);
  const settled = mesh.instanceMatrix.version;
  for (let i = 0; i < 40; i++) fx.advance(0.016);
  assert.equal(mesh.instanceMatrix.version, settled, "no uploads while nothing is alive");

  const g = { pilot: "donor-knife", time: 1, player: { ...actor }, pistol: { equipped: true, collected: true }, events: [], enemies: [], corpses: [], bolts: [], loot: [] };
  g.events = [{ type: "hit", actor: { id: 1, pos: { x: 2, z: 3 }, facing: { x: 0, z: -1 }, hp: 40, kind: 0 }, position: { x: 2, z: 3 }, weapon: "pistol", amount: 25, impactDirection: { x: 1, z: 0 } }];
  fx.events(g);
  fx.update(g);
  fx.advance(0.016);
  assert.ok(mesh.instanceMatrix.version > settled, "a live burst uploads");
  for (let i = 0; i < 400; i++) fx.advance(0.016); // far longer than any particle lives
  const parked = mesh.instanceMatrix.version;
  for (let i = 0; i < 40; i++) fx.advance(0.016);
  assert.equal(mesh.instanceMatrix.version, parked, "after the burst ends the pool is parked and left alone");
  assert.equal(mesh.visible, false, "an empty pool draws nothing");
});
