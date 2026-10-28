// Dev stand (never shipped): the real hunter GLB at the game's scale on the idle clip, with the real engine/hit-reaction.js laid on top.
// window.stand.hit(weapon, zone, dir) starts a reaction exactly as actors.js does for a hit event; advance(dt) samples the clip, then the reaction.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { bodyReactionStart, bodyReactionStep } from "../src/engine/hit-reaction.js";

const SCALE = 1.265 * 0.95;
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
scene.add(sun, new THREE.Mesh(new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2).translate(0, -0.05, 0), new THREE.MeshStandardMaterial({ color: 0x343a42 })));
camera.position.set(0, 3.4, 5.4);
camera.lookAt(0, 0.9, 0);

const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync("/assets/hunters/hunter-pitborn-106.glb"),
  root = new THREE.Group(),
  model = clone(gltf.scene);
root.add(model);
root.scale.setScalar(SCALE);
scene.add(root);
const view = { root, model },
  entity = { id: "hunter", markedHunter: true, hp: 100 },
  mixer = new THREE.AnimationMixer(model),
  idle = mixer.clipAction(gltf.animations.find((c) => c.name === "Armed"));
idle.play();
idle.paused = true;
let t = 0;
const advance = (dt) => {
  t += dt;
  idle.time = 0.1 * idle.getClip().duration; // the clip rewrites every bone each frame; the reaction lays on top
  mixer.update(0);
  bodyReactionStep(view, entity, dt);
  renderer.render(scene, camera);
};
// dir = the way the blow travels in ground coordinates (z = toward the hunter's front is the default facing here); zone forces the row.
const hit = (weapon, zone, dir = { x: 0, z: -1 }, amount = 40) => {
  view.bodyReaction = undefined;
  bodyReactionStart(view, { actor: entity, weapon, amount, impactDirection: dir });
  if (view.bodyReaction && zone) view.bodyReaction.zone = zone;
  return !!view.bodyReaction;
};
advance(0);
window.stand = { advance, hit, ready: true, active: () => !!view.bodyReaction, t: () => t };
