// Dev stand (never shipped): the real hunter GLB at the game's scale, the real physics-death.js seam with the Pitborn cut finishers, and an actor
// library stand-in that loads the cut GLB the way the game's does (a deferred model through ensureModels). `?weapon=shotgun&finisher=dismember`
// picks a victim id whose seeded roll gives that finisher (the first kill of a fresh page, like the game's first kill).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { physicsDeathStep, preloadPhysicsDeath } from "../src/engine/physics-death.js";
import { pickCutFinisher } from "../src/engine/finisher-cuts.js";
import { GAME_DATA } from "../src/engine/game-data.js";

const Q = new URLSearchParams(location.search),
  WEAPON = Q.get("weapon") ?? "shotgun",
  WANT = Q.get("finisher"),
  SCALE = 1.265 * 0.95,
  DEATH_TICKS = 144,
  ALIVE_SECONDS = 0.5;
const canvas = document.getElementById("c"),
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true }),
  scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(35, 375 / 812, 0.1, 50);
renderer.setPixelRatio(2);
renderer.setSize(375, 812, false);
scene.background = new THREE.Color(0x20242a);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(2, 4, 3);
scene.add(sun, new THREE.Mesh(new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2).translate(0, -0.3, 0), new THREE.MeshStandardMaterial({ color: 0x3a3f36, roughness: 1 })));
camera.position.set(0, 3.4, 8.6);
camera.lookAt(0, 0.5, 0);

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),
  gltf = await loader.loadAsync("/assets/hunters/hunter-pitborn-106.glb"),
  models = new Map([["marked-hunter", { gltf }]]),
  library = {
    models,
    manifest: { models: {} },
    async ensureModels(names) {
      for (const n of names) if (n === GAME_DATA.pitbornCuts.cutModel && !models.has(n)) models.set(n, { gltf: await loader.loadAsync("/assets/hunters/hunter-pitborn-106.cut.glb") });
    },
  },
  root = new THREE.Group(),
  model = clone(gltf.scene);
root.add(model);
root.scale.setScalar(SCALE);
scene.add(root);
// a victim id whose first seeded roll is the wanted finisher (fresh state, same as the game's first kill)
let victim = "hunter";
if (WANT) for (let i = 0; i < 400; i++) if (pickCutFinisher({ weapon: WEAPON }, `hunter-${i}`, { last: null, misses: 0, ordinal: 0 }) === WANT) { victim = `hunter-${i}`; break; }
const view = { root, model },
  entity = { id: victim, markedHunter: true, hp: 100, maxHP: 100, deathImpact: { x: 0.2, z: -1, weapon: WEAPON } },
  mixer = new THREE.AnimationMixer(model),
  action = (name) => mixer.clipAction(gltf.animations.find((c) => c.name === name)),
  idle = action("Armed"),
  death = action("Death");
for (const a of [idle, death]) { a.play(); a.paused = true; a.setEffectiveWeight(0); }
const sample = (a, other, phase) => {
  other.setEffectiveWeight(0);
  a.setEffectiveWeight(1);
  a.time = Math.min(Math.max(phase, 0), 1) * a.getClip().duration * (a === idle ? 0.1 : 1);
  mixer.update(0);
};
let t = 0;
const advance = (dt) => {
  t += dt;
  if (t < ALIVE_SECONDS) {
    entity.hp = t > 0.1 ? 40 : 100; // wounded: the cut GLB is fetched now, as in the game
    physicsDeathStep(view, entity, library, dt);
    sample(idle, death, 0);
  } else {
    entity.hp = 0;
    if (!physicsDeathStep(view, entity, library, dt)) sample(death, idle, (t - ALIVE_SECONDS) / (DEATH_TICKS / 60));
  }
  renderer.render(scene, camera);
};
const state = () => ({
  t,
  victim,
  physics: view.physicsDeath ? (view.physicsDeath.failed ? "failed" : "ragdoll") : "baked",
  plan: view.physicsDeath?.plan ? { id: view.physicsDeath.plan.id, steps: view.physicsDeath.plan.steps } : null,
  cuts: view.physicsDeath?.rd?.cuts ? [...view.physicsDeath.rd.cuts] : null,
  hiddenOriginal: model.visible === false,
  stats: globalThis.__physicsDeathStats,
});
preloadPhysicsDeath();
sample(idle, death, 0);
renderer.render(scene, camera);
window.stand = { advance, state, ready: true };
