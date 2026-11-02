// The MakeHuman crowd bodies ragdoll on death through the same data path as every other model (physicsRigs.json, no engine code).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { loadGeometry } from "../../art/donor/probe.mjs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { activeCount, registerDeath, releaseDeath, tierCaps } from "../src/engine/physics-death-impl.js";
import { physicsDeathStep, usePhysicsDeathImpl } from "../src/engine/physics-death.js";
import { liveBodies, rigOf } from "../src/engine/physics-rigs.js";

const RIGS = GAME_DATA.physicsRigs,
  POOL = GAME_DATA.crowdBodies.pool,
  read = (p) => readFileSync(new URL("../public/assets/" + p, import.meta.url)),
  manifest = JSON.parse(read("manifest-hollow.json")).models,
  bodies = POOL.filter((row) => !row.native),
  prefix = RIGS.rigs["mixamo-106"].nodePrefix;
const node = (scene, joint) => scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(prefix + joint));

test("every shipped MakeHuman body has a mixamo-106 ragdoll row, live exactly when the body is active", () => {
  for (const { ref, active } of bodies) {
    const m = RIGS.models[ref];
    assert(m, `${ref} has a physicsRigs model row`);
    assert.equal(m.rig, "mixamo-106");
    assert.equal(m.live, active, `${ref} is live exactly when it is active in crowdBodies.json (each live body row has its own parked pool)`);
    const rig = RIGS.bodies[m.body];
    assert.equal(Object.keys(rig.joints).length, 20);
    assert.equal(rig.scale_baked, 1, "unscaled (scale_baked 1): the sim frame is the actor root's local frame, which carries the manifest scale");
  }
  assert.equal(Object.keys(RIGS.models).filter((n) => n.startsWith("mh-")).length, bodies.length);
});

test("each body row is that body's own bind pose: the joints match the GLB nodes, feet on the floor, unscaled", async () => {
  for (const { ref } of bodies) {
    const row = RIGS.bodies[RIGS.models[ref].body],
      { scene } = await loadGeometry(read(manifest[ref].url));
    scene.updateMatrixWorld(true);
    const at = (joint) => new THREE.Vector3().setFromMatrixPosition(node(scene, joint).matrixWorld);
    const floor = Math.min(at("LeftToeBase").y, at("RightToeBase").y);
    for (const joint of Object.keys(row.joints)) {
      const p = at(joint);
      assert(
        Math.abs(p.x - row.joints[joint][0]) < 2e-3 && Math.abs(p.y - floor - row.joints[joint][1]) < 2e-3 && Math.abs(p.z - row.joints[joint][2]) < 2e-3,
        `${ref} ${joint}`,
      );
    }
    assert(row.height_m > 1.2 && row.height_m < 2.1, `${ref} height ${row.height_m}`);
  }
});

test("the hunter's row does not fit a MakeHuman body, so none shares it", () => {
  for (const { ref } of bodies) assert.notEqual(RIGS.models[ref].body, "physicsBody");
  assert.equal(new Set(bodies.map(({ ref }) => RIGS.models[ref].body)).size, bodies.length, "one measured row per body");
});

test("all active crowd bodies are live, yet the parked ragdolls across every row stay within maxParked (awake capsules the world steps)", async (t) => {
  const impl = await import("../src/engine/physics-death-impl.js");
  usePhysicsDeathImpl(impl);
  await impl.loadWorld();
  const live = liveBodies();
  assert(live.length >= 2 + bodies.filter((row) => row.active).length, "the hunter, the scavenger and every active body have their own row");
  assert.equal(GAME_DATA.physicsDeath.maxParked, 6, "no more parked ragdolls than before the crowd bodies");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  impl.warm();
  t.mock.timers.tick(GAME_DATA.physicsDeath.rewarmMs * (live.length + 2));
  assert(impl.parkedCount() > 0 && impl.parkedCount() <= GAME_DATA.physicsDeath.maxParked, `${impl.parkedCount()} parked ragdolls`);
  // Refills after deaths stay inside the same bound.
  for (const spec of live) t.mock.timers.tick(GAME_DATA.physicsDeath.rewarmMs);
  assert(impl.parkedCount() <= GAME_DATA.physicsDeath.maxParked);
});

test("a MakeHuman crowd body ragdolls through the real impl, and past the ragdoll cap its death takes the baked clip", async (t) => {
  const impl = await import("../src/engine/physics-death-impl.js");
  usePhysicsDeathImpl(impl);
  await impl.loadWorld();
  const ref = bodies.find((row) => row.active).ref,
    description = manifest[ref],
    gltf = await loadGeometry(read(description.url)),
    library = { models: new Map([[ref, { description, gltf }]]) };
  assert.equal(rigOf(ref).model, ref);
  const dying = async (id) => {
    const live = await loadGeometry(read(description.url)),
      root = new THREE.Group();
    root.add(live.scene);
    return { view: { description, root, model: live.scene }, entity: { id, hp: 0, maxHP: 10, deathImpact: { x: 0, z: 1, weapon: "pistol" } } };
  };
  const held = [];
  try {
    const first = await dying(910),
      hips = node(first.view.model, "Hips"),
      before = hips.position.clone();
    // A body with no parked ragdoll (past maxParked) builds its own on the first death: how long that frame takes is reported, and bounded.
    const t0 = performance.now(),
      started = physicsDeathStep(first.view, first.entity, library, 1 / 60, true),
      buildMs = performance.now() - t0;
    t.diagnostic(`first crowd-body death built its ragdoll in ${buildMs.toFixed(1)} ms`);
    assert.equal(started, true, "the body ragdolls");
    assert(buildMs < 250, `the first death frame took ${buildMs.toFixed(1)} ms`);
    assert(first.view.physicsDeath && !first.view.physicsDeath.failed);
    held.push(first.view.physicsDeath);
    for (let i = 0; i < 20; i++) assert.equal(physicsDeathStep(first.view, first.entity, library, 1 / 60, true), true);
    assert(hips.position.distanceTo(before) > 0 || hips.quaternion.angleTo(new THREE.Quaternion()) > 0, "the ragdoll drives the bones");
    // Fill the cap: a crowd death past it is baked and takes no body.
    while (activeCount() < tierCaps().humanoid)
      held.push(registerDeath({ physics: { step() {} }, rd: { awake: true, destroy() {} }, rig: { applyPose() {} }, age: 0, frozen: false }));
    const over = await dying(911);
    assert.equal(physicsDeathStep(over.view, over.entity, library, 1 / 60, true), false, "over the cap: the baked clip plays");
    assert.equal(over.view.physicsDeath.failed, true);
  } finally {
    for (const s of held) releaseDeath(s);
  }
});
