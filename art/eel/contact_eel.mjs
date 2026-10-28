// Contact vertices and bounds of the eel GLB (runs on the VPS, no browser):
//   node contact_eel.mjs <eel.glb> <tips.json> <three-dir>
// The shipped GLB is meshopt-compressed (vertices reordered, positions quantised, the dequantisation carried by the skin), so the vertex
// numbers must be read from the file the game loads. This strips the textures and the meshopt layer (order kept), loads the result with
// three's GLTFLoader, keeps the skeleton at its rest pose and prints, for each tooth tip named in tips.json (Blender coordinates written by
// build_eel.py), the index of the nearest vertex of the skinned mesh `world-raw` (what manifest-hollow.json contact.canines reads).
import fs from "node:fs";
import path from "node:path";
const [eel, tipsFile, threeDir] = process.argv.slice(2);
const gt = "/usr/lib/node_modules/@gltf-transform/cli/node_modules/";
const { NodeIO } = await import(gt + "@gltf-transform/core/dist/index.js");
const { ALL_EXTENSIONS } = await import(gt + "@gltf-transform/extensions/dist/index.js");
const { MeshoptDecoder: GtDecoder } = await import(gt + "meshoptimizer/meshopt_decoder.mjs");
await GtDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": GtDecoder });
const doc = await io.read(eel);
for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === "EXT_meshopt_compression") e.dispose();
for (const t of doc.getRoot().listTextures()) t.dispose();
const plain = path.join(path.dirname(eel), "eel-notex.glb");
fs.writeFileSync(plain, await io.writeBinary(doc));

const THREE = await import(path.join(threeDir, "build/three.module.js"));
const { GLTFLoader } = await import(path.join(threeDir, "examples/jsm/loaders/GLTFLoader.js"));
const buf = fs.readFileSync(plain);
const gltf = await new Promise((ok, bad) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", ok, bad));
const mesh = gltf.scene.getObjectByName("world-raw");
gltf.scene.updateMatrixWorld(true);
// The bones stay at the node transforms the file gives them (the rest pose); skeleton.pose() would cancel the dequantisation the skin carries.
mesh.skeleton.update();
mesh.updateMatrixWorld(true);
const n = mesh.geometry.attributes.position.count;
const P = [];
const v = new THREE.Vector3();
for (let i = 0; i < n; i++) {
  mesh.getVertexPosition(i, v);
  P.push(v.clone().applyMatrix4(mesh.matrixWorld));
}
const box = new THREE.Box3().setFromPoints(P);
console.log("verts", n, "min", box.min.toArray().map((x) => +x.toFixed(4)), "max", box.max.toArray().map((x) => +x.toFixed(4)));
const tips = JSON.parse(fs.readFileSync(tipsFile, "utf8"));
for (const [name, [x, y, z]] of Object.entries(tips)) {
  const g = new THREE.Vector3(x, z, -y); // Blender (x, y, z) -> glTF (x, z, -y)
  let best = 0, d = Infinity;
  P.forEach((q, i) => {
    const dd = q.distanceTo(g);
    if (dd < d) { d = dd; best = i; }
  });
  console.log("TIP", name, best, "err", d.toExponential(2), P[best].toArray().map((q) => +q.toFixed(4)));
}
