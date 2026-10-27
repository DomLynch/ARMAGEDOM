import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GAME_DATA } from "../src/engine/game-data.js";
import { createOffscreenThrottle, validateOffscreenActors } from "../src/engine/offscreen-actors.js";

const rules = GAME_DATA.offscreenActors;
const rig = () => {
  // A camera looking down +z (render z = -world z is flipped, so look toward -z in render space) from the player's spot.
  const camera = new THREE.PerspectiveCamera(40, 375 / 812, 0.1, 300);
  camera.position.set(0, 8, 8);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
};
const enemy = (id, x, z) => ({ id, pos: { x, z }, radius: 0.4 });
const view = () => ({ root: { visible: true } });

test("the data validates and bad rows are refused", () => {
  validateOffscreenActors(rules);
  for (const bad of [
    { ...rules, everyNthFrame: 0 },
    { ...rules, everyNthFrame: 1.5 },
    { ...rules, farDistance: 5, fullRateRadius: 9 },
    { ...rules, marginMetres: -1 },
    { ...rules, enabled: "yes" },
    { ...rules, extra: 1 },
    { schema_version: 1 },
  ])
    assert.throws(() => validateOffscreenActors(bad));
});

test("near and in-view hostiles are always updated and drawn", () => {
  const t = createOffscreenThrottle(THREE, rules),
    v = view();
  t.begin(rig(), { x: 0, z: 0 });
  for (let i = 0; i < 8; i++) {
    t.begin(rig(), { x: 0, z: 0 });
    assert.equal(t.skip(enemy(3, 0, -2), v, 1 / 60), false);
  }
  assert.equal(v.root.visible, true);
});

test("off-screen hostiles are hidden and updated once every N frames with the time they missed", () => {
  const t = createOffscreenThrottle(THREE, rules),
    v = view(),
    e = enemy(5, 25, 0);
  let updates = 0,
    carried = 0;
  for (let i = 0; i < rules.everyNthFrame * 5; i++) {
    t.begin(rig(), { x: 0, z: 0 });
    if (!t.skip(e, v, 1 / 60)) {
      updates++;
      carried += t.takePending(v) + 1 / 60;
    }
    assert.equal(v.root.visible, false);
  }
  carried += t.takePending(v);
  assert.equal(updates, 5);
  assert.ok(Math.abs(carried - (rules.everyNthFrame * 5) / 60) < 1e-9, "no time is lost");
});

test("an actor that walks back into view is shown and updated that same frame", () => {
  const t = createOffscreenThrottle(THREE, rules),
    v = view(),
    e = enemy(7, 25, 0);
  for (let i = 0; i < 3; i++) {
    t.begin(rig(), { x: 0, z: 0 });
    t.skip(e, v, 1 / 60);
  }
  assert.equal(v.root.visible, false);
  e.pos.x = 0;
  e.pos.z = -3;
  t.begin(rig(), { x: 0, z: 0 });
  assert.equal(t.skip(e, v, 1 / 60), false);
  assert.equal(v.root.visible, true);
  assert.ok(t.takePending(v) > 0, "the missed frames reach the animation");
});

test("switched off, every hostile is updated every frame", () => {
  const t = createOffscreenThrottle(THREE, { ...rules, enabled: false }),
    v = view();
  t.begin(rig(), { x: 0, z: 0 });
  assert.equal(t.skip(enemy(9, 25, 0), v, 1 / 60), false);
});
