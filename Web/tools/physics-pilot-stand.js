// Dev stand (never shipped): the real hunter GLB at the game's scale, the real physics-death.js seam, a baked Death clip as the fallback.
// ?physics=1 turns the ragdoll on, exactly as in the game. window.stand drives it deterministically for stills and measures frames.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { physicsDeathStep, preloadPhysicsDeath, physicsDeathEnabled } from "../src/physics-death.js";

const SCALE = 1.265 * 0.95, DEATH_TICKS = 144, ALIVE_SECONDS = 0.5; // CONTRACT.md characterScale x manifest scale; creatures.json deathTicks
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
scene.add(sun, new THREE.Mesh(new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x343a42 })));
camera.position.set(0, 3.4, 8.6); // wide enough for a 1.8 m corpse lying across a 375 px portrait frame
camera.lookAt(0, 0.5, 0);

const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync("/assets/hunters/hunter-pitborn-106.glb"),
  root = new THREE.Group(),
  model = clone(gltf.scene);
model.traverse((o) => { if (o.name.startsWith("cap_")) o.visible = false; }); // starterHidden in manifest-hollow.json
root.add(model);
root.scale.setScalar(SCALE);
scene.add(root);
const view = { root, model },
  entity = { id: "hunter", markedHunter: true, hp: 1 },
  library = { models: new Map([["marked-hunter", { gltf }]]) },
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
let t = 0, started = false;
const advance = (dt) => {
  t += dt;
  if (t < ALIVE_SECONDS) sample(idle, death, 0);
  else {
    entity.hp = 0;
    if (!physicsDeathStep(view, entity, library, dt)) sample(death, idle, (t - ALIVE_SECONDS) / (DEATH_TICKS / 60));
  }
  renderer.render(scene, camera);
};
const state = () => ({ t, physics: view.physicsDeath ? (view.physicsDeath.failed ? "failed" : "ragdoll") : "baked", flag: physicsDeathEnabled() });
const runRaf = (ms) => new Promise((resolve) => {
  const frames = []; let last = performance.now(); const end = last + ms;
  const tick = (now) => { frames.push(now - last); last = now; advance(1 / 60); now < end ? requestAnimationFrame(tick) : resolve(frames.slice(2)); };
  requestAnimationFrame(tick);
});
preloadPhysicsDeath();
sample(idle, death, 0);
renderer.render(scene, camera);
window.stand = { advance, state, runRaf, ready: true, begin: () => { started = true; t = 0; } };
void started;
