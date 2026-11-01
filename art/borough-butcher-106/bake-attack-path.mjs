// Regenerates the Butcher's baked strike path (Web/public/world/area-content.json paths["boss-butcher-attack"]) from the body's own Attack clip.
// usage (repo root, after `npm ci` in Web/): node art/borough-butcher-106/bake-attack-path.mjs <boss-butcher.glb> [--write]
// One row per 60 Hz tick of the swing (windup + active + recovery + 1 rows), the clip sampled at phase tick/total (donor-motion.js plays a native
// swing linearly over its duration): [hilt x, y, z, tip x, y, z] of the baked WeaponDrawn cleaver in model space, before the actor's scale.
// Hilt and tip are the two ends of the cleaver's longest axis in its own frame, the tip being the end farther from the hand socket.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const web = fileURLToPath(new URL("../../Web/", import.meta.url)),
  req = createRequire(web + "package.json"),
  THREE = req("three"),
  { GLTFLoader } = await import(new URL("file:///" + web.replaceAll("\\", "/") + "node_modules/three/examples/jsm/loaders/GLTFLoader.js")),
  { MeshoptDecoder } = await import(new URL("file:///" + web.replaceAll("\\", "/") + "node_modules/three/examples/jsm/libs/meshopt_decoder.module.js")),
  { NodeIO } = req("@gltf-transform/core").NodeIO ? req("@gltf-transform/core") : { NodeIO: null };
const [, , glbPath, flag] = process.argv;
const buf = readFileSync(glbPath);
globalThis.self = globalThis;
// textures are irrelevant to the pose: make the loader skip images
THREE.ImageBitmapLoader = class { load() {} setOptions() { return this; } };
const gltf = await new Promise((ok, no) => {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", ok, no);
});
const scene = gltf.scene,
  area = JSON.parse(readFileSync(web + "public/world/area-content.json", "utf8")),
  a = area.bosses?.profiles?.butcher?.attacks?.slash ?? Object.values(area).flatMap(function f(v) { return v && typeof v === "object" ? [v, ...Object.values(v).flatMap(f)] : []; }).find((o) => o.path === "boss-butcher-attack"),
  total = a.windupTicks + a.activeTicks + a.recoveryTicks,
  clip = gltf.animations.find((c) => c.name === a.clip);
scene.updateMatrixWorld(true);
const grip = scene.getObjectByName("WeaponDrawn"),
  socket = grip.parent,
  box = new THREE.Box3();
const inv = grip.matrixWorld.clone().invert();
grip.traverse((m) => {
  if (!m.isMesh) return;
  m.geometry.computeBoundingBox();
  box.union(m.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(m.matrixWorld)));
});
const size = box.getSize(new THREE.Vector3()),
  axis = ["x", "y", "z"].sort((p, q) => size[q] - size[p])[0],
  ends = [-1, 1].map((s) => {
    const c = box.getCenter(new THREE.Vector3());
    c[axis] = s < 0 ? box.min[axis] : box.max[axis];
    return c;
  });
ends.sort((p, q) => p.length() - q.length()); // hilt = nearer the socket origin
const mixer = new THREE.AnimationMixer(scene),
  action = mixer.clipAction(clip).play(),
  rows = [];
for (let i = 0; i <= total; i++) {
  action.time = (clip.duration * i) / total;
  mixer.update(0);
  scene.updateMatrixWorld(true);
  rows.push(ends.flatMap((p) => p.clone().applyMatrix4(grip.matrixWorld).toArray().map((n) => Number(n.toFixed(4)))));
}
console.log("axis", axis, "size", size.toArray().map((n) => n.toFixed(3)), "rows", rows.length, "first", rows[0], "mid", rows[total >> 1]);
if (flag === "--write") {
  const p = web + "public/world/area-content.json",
    text = readFileSync(p, "utf8"),
    eol = text.includes("\r\n") ? "\r\n" : "\n",
    key = '      "boss-butcher-attack": [',
    start = text.indexOf(key),
    end = text.indexOf(eol + "      ]", start) + (eol + "      ]").length;
  if (start < 0 || end < start) throw Error("path block not found");
  const body = rows.map((r) => `        [${eol}${r.map((n) => "          " + n).join("," + eol)}${eol}        ]`).join("," + eol);
  writeFileSync(p, text.slice(0, start) + key + eol + body + eol + "      ]" + text.slice(end));
  console.log("written");
}
