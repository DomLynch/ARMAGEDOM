// Dev stand (never shipped): the real hunter GLB under the real engine/burn-presentation.js, driven at 60 Hz with the same fields combat.js
// writes (flameBurnUntil, hp). ?burn=0 is the "before" picture (the flag is read by the module exactly as in the game).
// window.stand.show(scene, t) re-plays the scene from zero to t seconds and renders one frame.
//   living: flame held on the target for 1.6 s, then released (afterburn and cooling follow)
//   dying : flame held for 0.8 s, the target dies of it and falls on its back (the corpse keeps burning)
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createBurnPresentation } from "../src/engine/burn-presentation.js";
import { createFlameEffect } from "../src/engine/flame-effect.js";

const SCALE = 1.265 * 0.95, HOLD = { living: 1.6, dying: 0.8 }, DT = 1 / 60;
const canvas = document.getElementById("c"),
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true }),
  scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(35, 375 / 812, 0.1, 50);
renderer.setPixelRatio(2);
renderer.setSize(375, 812, false);
scene.background = new THREE.Color(0x20242a);
scene.add(new THREE.HemisphereLight(0xdde4ee, 0x445566, 1.3));
const sun = new THREE.DirectionalLight(0xfff0dd, 1.8);
sun.position.set(2, 4, 3);
scene.add(sun, new THREE.Mesh(new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2).translate(0, -0.02, 0), new THREE.MeshStandardMaterial({ color: 0x343a42 })));
camera.position.set(0, 3.2, 6.4);
camera.lookAt(0, 0.9, 0);
camera.updateMatrixWorld(true);

const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync("/assets/hunters/hunter-pitborn-106.glb"),
  root = new THREE.Group(),
  model = clone(gltf.scene);
root.add(model);
root.scale.setScalar(SCALE);
scene.add(root);
const flashMaterials = [], seen = new Set();
model.traverse((o) => {
  if (!o.isMesh) return;
  o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
  for (const material of Array.isArray(o.material) ? o.material : [o.material])
    if (!seen.has(material)) {
      seen.add(material);
      flashMaterials.push({ material, color: material.color?.clone(), emissive: material.emissive?.clone(), intensity: material.emissiveIntensity, roughness: material.roughness });
    }
});
const restore = () => {
  for (const m of flashMaterials) {
    m.material.color.copy(m.color);
    m.material.emissive?.copy(m.emissive);
    m.material.emissiveIntensity = m.intensity;
    m.material.roughness = m.roughness;
  }
};
const world = { areaId: "stand", camera, lineClear: () => true };
let burn = null, contact = null;
const entity = { id: 1, hp: 30, pos: { x: 0, z: 0 }, rig: "marked-hunter", mobSize: 1, flameBurnUntil: 0 };
// The game's own flame stream and short contact burn (flame-effect.js) run in both pictures; only the burn look differs.
const game = {
  time: 10,
  world: { flameData: { contact: { range: 3, coneDegrees: 40 } } },
  flame: { equipped: true, active: false },
  player: { hp: 100, pos: { x: 0, z: -2.5 } },
  enemies: [entity],
  corpses: [],
};
const source = { position: { x: 0, y: 1.1, z: -2.5 }, direction: { x: 0, y: 0, z: 1 } };

function show(kind, seconds) {
  burn?.dispose();
  contact?.dispose();
  contact = createFlameEffect({ THREE, scene, world, getSource: () => source, getView: () => ({ model, finisherAge: 0 }) });
  burn = createBurnPresentation({ THREE, scene, world, getView: () => ({ flashMaterials }), reducedMotion: () => false });
  Object.assign(entity, { hp: 30, flameBurnUntil: 0 });
  Object.assign(game, { time: 10, enemies: [entity], corpses: [] });
  root.rotation.set(0, 0.5, 0);
  root.position.set(0, 0, 0);
  const start = game.time;
  for (let t = 0; t <= seconds + 1e-9; t += DT) {
    game.time = start + t;
    if (t < HOLD[kind]) entity.flameBurnUntil = game.time + 0.35; // flameHit(): refreshed while the stream touches
    if (kind === "dying" && t >= HOLD[kind] && entity.hp > 0) {
      entity.hp = 0;
      game.enemies = [];
      game.corpses = [entity];
    }
    if (entity.hp <= 0) {
      const lie = Math.min(1, (t - HOLD[kind]) / 0.8);
      root.rotation.set(-Math.PI / 2 * lie, 0.5, 0);
      root.position.set(0, 0.34 * lie, 0);
    }
    game.flame.active = t < HOLD[kind];
    restore(); // what actors.js does at the start of every frame
    contact.update(game);
    burn.update(game);
  }
  renderer.render(scene, camera);
  return burn.snapshot();
}
window.stand = { show, ready: true };
restore();
renderer.render(scene, camera);
