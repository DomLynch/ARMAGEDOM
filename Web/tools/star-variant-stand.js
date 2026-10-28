// Dev stand (never shipped): the real hunter GLB at the game's scale, drawn plain and as a star variant. The 2-star copy gets the
// real data row's scale and the real engine/star-variants-view.js tell on its own cloned materials, exactly as actors.js does.
// window.stand.show("plain" | "1" | "2") swaps which one is in view.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { STAR_VARIANTS } from "../src/engine/star-variants.js";
import { applyStarTell } from "../src/engine/star-variants-view.js";

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

const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync("/assets/hunters/hunter-pitborn-106.glb");
const build = (stars) => {
  const model = clone(gltf.scene),
    root = new THREE.Group(),
    row = STAR_VARIANTS.stars.find((r) => r.stars === stars);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    if (row) for (const m of Array.isArray(o.material) ? o.material : [o.material]) applyStarTell(m, { tell: row.tell });
  });
  const mixer = new THREE.AnimationMixer(model);
  const idle = mixer.clipAction(gltf.animations.find((c) => c.name === "Armed"));
  idle.play();
  idle.paused = true;
  idle.time = 0.1 * idle.getClip().duration;
  mixer.update(0);
  root.add(model);
  root.scale.setScalar(SCALE * (row?.scale ?? 1));
  root.visible = false;
  scene.add(root);
  return root;
};
const views = { plain: build(0), 1: build(1), 2: build(2) };
const show = (which) => {
  for (const [k, v] of Object.entries(views)) v.visible = k === which;
  renderer.render(scene, camera);
};
show("plain");
window.stand = { show, ready: true };
