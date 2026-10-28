// LAZY chunk: loaded only with ?physics=1 (see physics-death.js). Jolt WASM + @frankendom/physics + the body measure row live here and nowhere else.
import * as THREE from "three";
import { createPhysics } from "@frankendom/physics";
import { createThreeRig } from "@frankendom/physics/three-rig";
import { GAME_DATA } from "./game-data.js";

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
// Crowd budget (mass mobs, kills in bursts): `poolSize` parked bodies, refilled ONE per kill so a burst never builds many at once; at most
// `maxActive` corpses simulate at the same time, the oldest is frozen where it lies (pose kept, no more steps) when a new death starts.
const pool = [],
  active = [];
function warmOne() {
  if (pool.length < CFG.poolSize) pool.push(world.createRagdoll(ROW(), { position: [0, 0, 0], id: "parked" }));
}
export function warm() {
  while (pool.length < CFG.poolSize) warmOne();
  world.step(1 / CFG.stepHz); // first step compiles the paths the death frame would otherwise pay for
}

// Silent always-on diagnostic: read it from the console or a harness (`__physicsDeathStats`); nothing is ever logged.
const stats = (globalThis.__physicsDeathStats ??= { created: 0, released: 0, active: 0, lastAt: 0, chunkLoaded: false });
export const markChunkLoaded = () => (stats.chunkLoaded = true);

// The impulse in the sim frame (= the actor root's local frame): `horizontal` along the killing blow (the hit's impactDirection, else
// away from where the hunter faces, i.e. back from the player it was walking at) plus `up`. Pure arithmetic: same hit, same fall.
export function killVector(root, entity) {
  const k = CFG.killImpulse,
    d = entity.deathImpact ?? (entity.facing ? { x: -entity.facing.x, z: -entity.facing.z } : { x: 0, z: -1 }),
    len = Math.hypot(d.x, d.z) || 1,
    local = new THREE.Vector3(d.x / len, 0, d.z / len).applyQuaternion(root.quaternion.clone().invert());
  return [local.x * k.horizontal, k.up, local.z * k.horizontal];
}

export function startDeath(view, bindScene, entity) {
  const rd = pool.pop() ?? world.createRagdoll(ROW(), { position: [0, 0, 0], id: String(entity.id) }),
    bones = boneMap(view.model);
  setTimeout(warmOne, CFG.rewarmMs);
  if (Object.values(bones).some((b) => !b)) throw new Error("the hunter lacks a bone of the mixamo-106 map");
  const rig = createThreeRig(THREE, rd, bones, view.root, { bind: { bones: boneMap(bindScene), root: bindScene } });
  rig.drive();
  rd.snapToTarget();
  rd.kill({ part: CFG.killImpulse.part, impulse: killVector(view.root, entity) });
  stats.created++;
  stats.lastAt = performance.now();
  return registerDeath({ physics: world, rd, rig, age: 0, clock: worldClock, frozen: false });
}

// Track a corpse; past `maxActive` the oldest live one is frozen where it lies.
export function registerDeath(s) {
  for (let live = active.filter((a) => !a.frozen); live.length >= CFG.maxActive; live.shift()) {
    live[0].frozen = true; // the bones keep the last applied pose; the body leaves the world so it stops costing steps
    live[0].rd?.destroy();
    live[0].rd = null;
  }
  active.push(s);
  stats.active = active.length;
  return s;
}
export const activeCount = () => active.length;

// Free a corpse's body and its active entry (settled, removed from the scene, or the actor despawned). Safe to call twice.
export function releaseDeath(s) {
  s.frozen = true;
  s.rd?.destroy();
  s.rd = null;
  const i = active.indexOf(s);
  if (i >= 0) {
    active.splice(i, 1);
    stats.released++;
    stats.active = active.length;
  }
}

// The world is shared and `world.step` advances EVERY ragdoll in it, so it must advance once per rendered frame however many corpses
// there are. `worldClock` is the simulated time of the world; each corpse keeps its own clock (started at worldClock) and steps the world
// only while its clock is ahead of it, so N corpses calling once per frame make one step set, not N.
let worldClock = 0;
const STEP = () => 1 / CFG.stepHz;

// One render frame: bones follow the capsules; frozen after settleSeconds (or asleep), body freed after removeSeconds.
export function stepDeath(s, dt) {
  s.age += dt;
  if (!s.frozen) {
    s.clock ??= worldClock;
    s.clock = Math.min(s.clock + dt, worldClock + CFG.maxStepsPerFrame * STEP());
    while (worldClock + STEP() <= s.clock) {
      s.physics.step(STEP());
      worldClock += STEP();
    }
    s.rig.applyPose();
    if (s.age >= CFG.settleSeconds || !s.rd.awake) s.frozen = true;
  }
  if (s.frozen && s.age >= CFG.removeSeconds) releaseDeath(s);
}
