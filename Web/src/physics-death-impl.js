// LAZY chunk: loaded only with ?physics=1 (see physics-death.js). Jolt WASM + @frankendom/physics + the body measure row live here and nowhere else.
import * as THREE from "three";
import { createPhysics } from "@frankendom/physics";
import { createThreeRig } from "@frankendom/physics/three-rig";
import { GAME_DATA } from "./engine/game-data.js";

const CFG = GAME_DATA.physicsDeath,
  ROW = () => structuredClone(GAME_DATA.physicsBody.row); // GAME_DATA is frozen; the package gets its own copy

let world = null;
export async function loadWorld() {
  return (world ??= await createPhysics({ seed: CFG.seed }));
}

const boneOf = (scene, joint) =>
  scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(GAME_DATA.physicsBody.nodePrefix + joint));
const boneMap = (scene) =>
  Object.fromEntries(Object.entries(CFG.parts).map(([part, joint]) => [part, boneOf(scene, joint)]));

// Hand the hunter's last animated pose (the bones, as the previous frame left them) to a ragdoll. `view.root` is the actor group,
// `view.model` the clone, `bindScene` the untouched loaded glTF scene (the bind pose the body row was measured in). Synchronous.
// Parked ragdolls: built on idle after the preload so the death frame only claims one. A parked ragdoll is never stepped (the world is
// stepped only while a corpse is moving), so it costs nothing per frame; the pool is refilled after the corpse is freed.
const pool = [];
export function warm() {
  while (pool.length < CFG.poolSize) pool.push(world.createRagdoll(ROW(), { position: [0, 0, 0], id: "parked" }));
  world.step(1 / CFG.stepHz); // first step compiles the paths the death frame would otherwise pay for
}

export function startDeath(view, bindScene, entity) {
  const rd = pool.pop() ?? world.createRagdoll(ROW(), { position: [0, 0, 0], id: String(entity.id) }),
    bones = boneMap(view.model);
  setTimeout(warm, CFG.rewarmMs);
  if (Object.values(bones).some((b) => !b)) throw new Error("the hunter lacks a bone of the mixamo-106 map");
  const rig = createThreeRig(THREE, rd, bones, view.root, { bind: { bones: boneMap(bindScene), root: bindScene } });
  rig.drive();
  rd.snapToTarget();
  rd.kill({ part: "spine2", impulse: CFG.killImpulse }); // kill() needs an impulse vector (sim frame: -z is back from the hunter)
  return { physics: world, rd, rig, age: 0, acc: 0, frozen: false };
}

// One render frame: fixed-rate steps, bones follow the capsules; frozen after settleSeconds (or asleep), body freed after removeSeconds.
export function stepDeath(s, dt) {
  s.age += dt;
  if (!s.frozen) {
    s.acc = Math.min(s.acc + dt, CFG.maxStepsPerFrame / CFG.stepHz);
    while (s.acc >= 1 / CFG.stepHz) {
      s.physics.step(1 / CFG.stepHz);
      s.acc -= 1 / CFG.stepHz;
    }
    s.rig.applyPose();
    if (s.age >= CFG.settleSeconds || !s.rd.awake) s.frozen = true;
  }
  if (s.frozen && s.age >= CFG.removeSeconds && s.rd) {
    s.rd.destroy();
    s.rd = null;
  }
}
