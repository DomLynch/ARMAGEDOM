// Replaces the wolf's skinned mesh and its two textures in wolf.glb with the elephant's, keeping every node, the 31-joint skin, its inverse bind
// matrices, all seven clips (byte-identical keyframes) and the node names ("wolf", "QuadRig", "WeaponDrawn") the game looks up.
// Run on the VPS: node elephant_swap.mjs wolf.glb elephant_mesh.npz.json colour.webp emissive.webp out-raw.glb
import fs from "node:fs";
const MOD = "/usr/lib/node_modules/@gltf-transform/cli/node_modules/";
const { NodeIO } = await import(MOD + "@gltf-transform/core/dist/index.js");
const { ALL_EXTENSIONS } = await import(MOD + "@gltf-transform/extensions/dist/index.js");
const { MeshoptDecoder, MeshoptEncoder } = await import(MOD + "meshoptimizer/index.js");
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const [wolf, meshJson, colour, emissive, out] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(meshJson, "utf8"));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(wolf);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const mesh = root.listMeshes()[0];
const prim = mesh.listPrimitives()[0];
const skin = root.listSkins()[0];
const joints = skin.listJoints().map((j) => j.getName());
const toSkin = data.joints.map((name) => {
  const i = joints.indexOf(name);
  if (i < 0) throw Error(`joint ${name} is not in the wolf skin`);
  return i;
});
const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
const n = data.pos.length / 3;
const J = new Uint16Array(n * 4);
for (let i = 0; i < n * 4; i++) J[i] = toSkin[data.jidx[i]];
const old = prim.listAttributes().concat(prim.getIndices() ? [prim.getIndices()] : []);
for (const semantic of prim.listSemantics()) prim.setAttribute(semantic, null);
prim.setAttribute("POSITION", acc("VEC3", new Float32Array(data.pos)));
prim.setAttribute("NORMAL", acc("VEC3", new Float32Array(data.nor)));
prim.setAttribute("TEXCOORD_0", acc("VEC2", new Float32Array(data.uv)));
prim.setAttribute("JOINTS_0", acc("VEC4", J));
prim.setAttribute("WEIGHTS_0", acc("VEC4", new Float32Array(data.jw)));
prim.setIndices(acc("SCALAR", new Uint16Array(data.tris)));
for (const a of old) a.dispose();
const material = prim.getMaterial();
const set = (texture, file) => texture.setImage(new Uint8Array(fs.readFileSync(file))).setMimeType("image/webp");
set(material.getBaseColorTexture(), colour);
set(material.getEmissiveTexture(), emissive);
await io.write(out, doc);
console.log("SWAPPED", { verts: n, tris: data.tris.length / 3, joints: joints.length, clips: root.listAnimations().map((a) => a.getName()) });
