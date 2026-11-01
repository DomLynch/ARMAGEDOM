// The ?player=perseus player's death on the 106-bone Perseus body: its own ragdoll row (not the hero's 65-bone map), seated on the floor.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { loadGeometry } from "../../art/donor/probe.mjs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { physicsDeathStep, releasePhysicsDeath, usePhysicsDeathImpl } from "../src/engine/physics-death.js";
import { rigOf } from "../src/engine/physics-rigs.js";
import FLOOR from "../src/data/physicsFloor.json" with { type: "json" };

const read = (p) => readFileSync(new URL("../public/assets/" + p, import.meta.url)),
  manifest = JSON.parse(read("manifest-hollow.json")),
  swap = manifest.playerSwap,
  RIGS = GAME_DATA.physicsRigs,
  DT = 1 / GAME_DATA.physicsDeath.stepHz,
  sanitize = (name) => THREE.PropertyBinding.sanitizeNodeName(name),
  // the player row the way actors.js dresses it for ?player=perseus
  swapped = () => {
    const row = structuredClone(manifest.models[swap.model]);
    for (const field of swap.fields)
      if (manifest.models[swap.use][field] !== undefined) row[field] = manifest.models[swap.use][field];
      else delete row[field];
    return row;
  };
const body = async () => loadGeometry(read(manifest.models[swap.use].url));
const dying = async (description) => {
  const gltf = await body(),
    root = new THREE.Group(),
    model = clone(gltf.scene);
  root.add(model);
  const lib = { models: new Map([[swap.model, { description, gltf: { scene: gltf.scene } }]]) };
  return { view: { root, model, description, physicsDeath: undefined }, lib, gltf };
};
const entity = () => ({
  id: GAME_DATA.physicsBudget.local_player_id,
  kind: -1,
  hp: 0,
  maxHP: 10,
  response: { clip: "Death", start: 1 },
});
const loadChunk = async () => {
  const impl = await import("../src/engine/physics-death-impl.js");
  usePhysicsDeathImpl(impl);
  await impl.loadWorld();
  return impl;
};

test("the Perseus player row names a live 106-rig ragdoll row; the hero player row names none and keeps the hero's", () => {
  const row = manifest.models[swap.use],
    id = row.ragdollRow;
  assert.ok(swap.fields.includes("ragdollRow"));
  assert.equal(swapped().ragdollRow, id);
  assert.equal(manifest.models[swap.model].ragdollRow, undefined, "flag off: the player row is untouched");
  assert.deepEqual(RIGS.models[id], { rig: "mixamo-106", body: id, live: true });
  assert.equal(rigOf(id).body, RIGS.bodies[id]);
  assert.equal(rigOf(swap.model).body, RIGS.bodies["scavenger-65"], "the hero row still ragdolls on its own body");
  assert.equal(RIGS.bodies[id].scale_baked, 1);
  assert.ok(row.scale > 0 && row.scale <= 1, "the actor root carries the row scale; the x1 ragdoll body rides it (physics-death-impl copies view.model.scale)");
  const live = Object.keys(RIGS.models).filter((name) => RIGS.models[name].live && !RIGS.models[name].chain);
  assert.ok(
    live.indexOf(id) >= 2,
    "not one of the first live bodies, whose pools are parked at start (maxParked): built on the first death",
  );
});

test("the Perseus body row is his bind pose and every bone of the rig map and the floor table is in his GLB", async () => {
  const id = manifest.models[swap.use].ragdollRow,
    { scene } = await body(),
    bodyRow = RIGS.bodies[id];
  scene.updateMatrixWorld(true);
  for (const [joint, [x, y, z]] of Object.entries(bodyRow.joints)) {
    const node = scene.getObjectByName(sanitize("mixamorig:" + joint));
    assert.ok(node, joint);
    const p = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
    assert.ok(
      Math.abs(p.x - x) + Math.abs(p.y - y) + Math.abs(p.z - z) < 0.02,
      `${joint} is where the body row put it`,
    );
  }
  assert.ok(bodyRow.height_m > 1.5 && bodyRow.height_m < 1.8);
  for (const bone of FLOOR.models[id].bones) assert.ok(scene.getObjectByName(sanitize(bone)), "floor bone " + bone);
  assert.ok(FLOOR.models[id].vertices.length > 100);
});

test("the dressed player ragdolls on the Perseus body, falls to the floor and is lifted to rest on it; the hero row on that skeleton stays baked", async () => {
  await loadChunk();
  const { view, lib } = await dying(swapped());
  assert.equal(physicsDeathStep(view, entity(), lib, DT, true), true);
  assert.ok(view.physicsDeath && !view.physicsDeath.failed);
  // the actor view puts the root back on the floor before every step; the corpse's lift is added on top of that
  for (let i = 0; i < 240; i++) {
    view.root.position.y = 0;
    assert.equal(physicsDeathStep(view, entity(), lib, DT, true), true);
  }
  view.root.updateMatrixWorld(true);
  const hips = new THREE.Vector3().setFromMatrixPosition(
      view.model.getObjectByName(sanitize("mixamorig:Hips")).matrixWorld,
    ),
    head = new THREE.Vector3().setFromMatrixPosition(
      view.model.getObjectByName(sanitize("mixamorig:Head")).matrixWorld,
    );
  for (const v of [hips, head]) assert.ok([v.x, v.y, v.z].every(Number.isFinite));
  assert.ok(hips.y < 0.5, `the hips came down from standing 0.96 m (now ${hips.y.toFixed(2)} m)`);
  assert.ok(head.y < 0.7, `the head lies low (${head.y.toFixed(2)} m)`);
  assert.ok(view.physicsDeath.floor, "the corpse is seated on the floor from the floor table");
  assert.ok(view.root.position.y >= 0 && view.root.position.y < 0.3, `lift ${view.root.position.y.toFixed(3)} m`);
  releasePhysicsDeath(view);

  const hero = await dying(manifest.models[swap.model]);
  assert.equal(
    physicsDeathStep(hero.view, entity(), hero.lib, DT, true),
    false,
    "the hero's 65-bone map finds none of his bones: baked clip",
  );
});
