// Measures the bite contact vertex of a native-skeleton creature GLB, the way Web/tests/wolf221-contact.test.js reads it: the posed vertex of
// the node "wolf" through the Bite clip, in rig metres. Prints the vertex, its path, and the planar reach and lateral offset the data rows carry
// once multiplied by the actor scale (manifest scale x 1.265 character x 1.3225 visual).
// Run from the repo root on a machine with Web/node_modules:
//   node art/monster-elephant/elephant_measure.mjs <glb> [vertexIndex]        (no index: pick the front-most centre-line trunk vertex)
import fs from "node:fs";
import * as THREE from "../../Web/node_modules/three/build/three.module.js";
import { loadGeometry } from "../donor/probe.mjs";

const [file, indexArg] = process.argv.slice(2);
const gltf = await loadGeometry(fs.readFileSync(file));
const scene = gltf.scene;
scene.updateMatrixWorld(true);
const mesh = scene.getObjectByName("wolf");
const v = new THREE.Vector3();
const n = mesh.geometry.attributes.position.count;
let index = indexArg === undefined ? -1 : Number(indexArg);
if (index < 0) {
  // rest pose: centre line (|x| small), 0.26..0.30 high (the trunk's strike falls about 0.09 to chest height), furthest forward (+z)
  let best = -Infinity;
  for (let i = 0; i < n; i++) {
    mesh.getVertexPosition(i, v);
    v.applyMatrix4(mesh.matrixWorld);
    if (Math.abs(v.x) < 0.012 && v.y > 0.26 && v.y < 0.3 && v.z > best) {
      best = v.z;
      index = i;
    }
  }
}
const clip = gltf.animations.find((c) => c.name === "Bite");
const mixer = new THREE.AnimationMixer(scene);
const action = mixer.clipAction(clip);
action.play();
const rows = [];
for (let k = 0; k <= 20; k++) {
  const p = k / 20;
  mixer.setTime(p * clip.duration);
  scene.updateMatrixWorld(true);
  mesh.skeleton.update();
  mesh.getVertexPosition(index, v);
  v.applyMatrix4(mesh.matrixWorld);
  rows.push({ p, x: +v.x.toFixed(4), y: +v.y.toFixed(4), z: +v.z.toFixed(4), planar: +Math.hypot(v.x, v.z).toFixed(4) });
}
console.log(JSON.stringify({ file, vertices: n, index, clip: clip.duration, rows }));
