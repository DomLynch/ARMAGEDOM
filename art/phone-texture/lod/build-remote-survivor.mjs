// Builds the reduced remote-player mesh from the shipped player model.
// usage: node build-remote-survivor.mjs <src warrior-phone.glb> <dst remote-survivor.glb> [targetTriangles=12000]
// Keeps the skeleton, skin (joints + inverse binds), node transforms and the idle/walk/run clips untouched.
// Replaces the 17 body meshes by 3 primitives (skin / cloth / gear) with colour baked into vertex colours, and decimates them with
// meshoptimizer (vertices are kept, only the index buffer shrinks, so every surviving vertex keeps its original skin weights).
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const [src, dst, target = "12000"] = process.argv.slice(2),
  TARGET_TRIANGLES = Number(target),
  // No clips are shipped: the kit plays the player model's own clips on this skeleton (same joint names), so the clip data is the
  // untouched original and this file stays small.
  KEEP_CLIPS = new Set(),
  // Three draw calls. Skin carries everything that is never tinted (skin, head, leather, brass, steel); Gambeson is the tunic and
  // wraps (the kit multiplies its garment tint); Heraldry is the skirt cloth (the kit replaces its colour with the variant accent,
  // so the baked texture colour multiplies the accent exactly as on the full model).
  GROUP_OF = { Skin: "Skin", Face: "Skin", Photo: "Skin", Leather: "Skin", "Antique brass": "Skin", Steel: "Skin", Gambeson: "Gambeson", Wrap: "Gambeson", Heraldry: "Heraldry" },
  DROP_MATERIALS = new Set(["PhotoEyes", "PhotoTeeth"]),
  WEAPON_NODE = /^(SwordSheathed|SwordDrawn|WeaponDrawn|WeaponSheathed)(_\d+)?$/,
  GROUP_STYLE = { Skin: { roughness: 0.75, double: false }, Gambeson: { roughness: 0.9, double: false }, Heraldry: { roughness: 0.9, double: true } };
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS),
  doc = await io.read(src),
  root = doc.getRoot();
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

// decoded base colour textures, sampled with bilinear + repeat
const textures = new Map();
async function decode(texture) {
  if (!texture) return null;
  if (!textures.has(texture)) {
    const { data, info } = await sharp(Buffer.from(texture.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    textures.set(texture, { data, w: info.width, h: info.height });
  }
  return textures.get(texture);
}
function sample(tex, u, v) {
  const x = (((u % 1) + 1) % 1) * tex.w - 0.5, y = (((v % 1) + 1) % 1) * tex.h - 0.5,
    x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, out = [0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const xi = (((x0 + dx) % tex.w) + tex.w) % tex.w, yi = (((y0 + dy) % tex.h) + tex.h) % tex.h, i = (yi * tex.w + xi) * 4;
    for (let k = 0; k < 3; k++) out[k] += w * srgbToLinear(tex.data[i + k] / 255);
  }
  return out;
}

// drop the weapon nodes (the kit equips the shared knife the same way the player does)
const weaponNodes = root.listNodes().filter((n) => WEAPON_NODE.test(n.getName()));
for (const n of weaponNodes) n.dispose();

const skinned = root.listNodes().filter((n) => n.getMesh() && n.getSkin());
// The source stores one skin object per mesh; they must describe the same skeleton (same joints, same inverse binds) to be merged.
const skinSignature = (s) =>
  createHash("sha256")
    .update(s.listJoints().map((j) => j.getName()).join("|"))
    .update(Buffer.from(new Float32Array(s.getInverseBindMatrices().getArray()).buffer))
    .digest("hex");
const signatures = new Set(skinned.map((n) => skinSignature(n.getSkin())));
if (signatures.size !== 1) throw Error(`skins differ: ${signatures.size} distinct skeletons`);
const skin = skinned[0].getSkin();
console.error("skins merged:", new Set(skinned.map((n) => n.getSkin())).size, "->", 1);

const groups = new Map(); // group -> { positions[], normals[], colors[], joints[], weights[], indices[], base }
let sourceTriangles = 0, droppedTriangles = 0;
for (const node of skinned) {
  for (const prim of node.getMesh().listPrimitives()) {
    const material = prim.getMaterial(), name = material?.getName() ?? "none",
      tris = (prim.getIndices()?.getCount() ?? prim.getAttribute("POSITION").getCount()) / 3;
    if (DROP_MATERIALS.has(name)) { droppedTriangles += tris; continue; }
    const groupName = GROUP_OF[name];
    if (!groupName) throw Error("unmapped material " + name);
    sourceTriangles += tris;
    const g = groups.get(groupName) ?? { positions: [], normals: [], colors: [], joints: [], weights: [], indices: [], base: 0 };
    groups.set(groupName, g);
    const pos = prim.getAttribute("POSITION"), nor = prim.getAttribute("NORMAL"), uv = prim.getAttribute("TEXCOORD_0"),
      jnt = prim.getAttribute("JOINTS_0"), wgt = prim.getAttribute("WEIGHTS_0"), idx = prim.getIndices();
    // The kit replaces the Heraldry colour factor with the variant accent, so bake only its texture (as the full model would show).
    const tex = await decode(material.getBaseColorTexture()), factor = name === "Heraldry" ? [1, 1, 1, 1] : material.getBaseColorFactor(), p = [0, 0, 0], q = [0, 0], j = [0, 0, 0, 0];
    const n = pos.getCount();
    for (let i = 0; i < n; i++) {
      pos.getElement(i, p); g.positions.push(...p);
      nor.getElement(i, p); g.normals.push(...p);
      let c = [1, 1, 1];
      if (tex && uv) { uv.getElement(i, q); c = sample(tex, q[0], q[1]); }
      g.colors.push(c[0] * factor[0], c[1] * factor[1], c[2] * factor[2]);
      jnt.getElement(i, j); g.joints.push(...j);
      wgt.getElement(i, j); g.weights.push(...j);
    }
    for (let i = 0; i < idx.getCount(); i++) g.indices.push(idx.getScalar(i) + g.base);
    g.base += n;
  }
}

// decimate each group to its share of the triangle budget
const total = [...groups.values()].reduce((s, g) => s + g.indices.length / 3, 0), report = {};
const out = new Map();
for (const [name, g] of groups) {
  const tris = g.indices.length / 3, goal = Math.max(300, Math.round((TARGET_TRIANGLES * tris) / total)),
    count = g.base, attrStride = 3 + 3 + 4, attrs = new Float32Array(count * attrStride);
  for (let i = 0; i < count; i++) {
    attrs.set(g.normals.slice(i * 3, i * 3 + 3), i * attrStride);
    attrs.set(g.colors.slice(i * 3, i * 3 + 3), i * attrStride + 3);
    attrs.set(g.weights.slice(i * 4, i * 4 + 4), i * attrStride + 6);
  }
  const positions = new Float32Array(g.positions), indices = new Uint32Array(g.indices),
    [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attrs, attrStride, [0.5, 0.5, 0.5, 1, 1, 1, 1, 1, 1, 1], null, goal * 3, 1, []);
  // compact the vertex buffers to the vertices still referenced
  const remap = new Map(), keep = [];
  for (const v of simplified) if (!remap.has(v)) { remap.set(v, keep.length); keep.push(v); }
  const pick = (arr, size) => { const o = new Array(keep.length * size); keep.forEach((v, k) => { for (let c = 0; c < size; c++) o[k * size + c] = arr[v * size + c]; }); return o; };
  out.set(name, {
    positions: new Float32Array(pick(g.positions, 3)), normals: new Float32Array(pick(g.normals, 3)), colors: new Float32Array(pick(g.colors, 3)),
    joints: new Uint16Array(pick(g.joints, 4)), weights: new Float32Array(pick(g.weights, 4)),
    indices: new Uint16Array(Array.from(simplified, (v) => remap.get(v))),
  });
  report[name] = { sourceTriangles: tris, goal, triangles: simplified.length / 3, vertices: keep.length, error };
}

// replace the body meshes with one skinned mesh of three primitives
const buffer = root.listBuffers()[0], scene = root.listScenes()[0];
const mesh = doc.createMesh("RemoteSurvivor");
for (const [name, d] of out) {
  const style = GROUP_STYLE[name],
    material = doc.createMaterial(name).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(style.roughness).setMetallicFactor(0).setDoubleSided(style.double);
  const acc = (type, array, tname) => doc.createAccessor(`${name}_${tname}`).setType(type).setArray(array).setBuffer(buffer);
  mesh.addPrimitive(
    doc.createPrimitive().setMaterial(material)
      .setAttribute("POSITION", acc("VEC3", d.positions, "POSITION")).setAttribute("NORMAL", acc("VEC3", d.normals, "NORMAL"))
      .setAttribute("COLOR_0", acc("VEC3", d.colors, "COLOR_0")).setAttribute("JOINTS_0", acc("VEC4", d.joints, "JOINTS_0"))
      .setAttribute("WEIGHTS_0", acc("VEC4", d.weights, "WEIGHTS_0")).setIndices(acc("SCALAR", d.indices, "indices")),
  );
}
for (const n of skinned) n.dispose();
const node = doc.createNode("RemoteSurvivor").setMesh(mesh).setSkin(skin);
scene.addChild(node);

// keep only the clips the remote figure plays
for (const a of root.listAnimations()) {
  if (KEEP_CLIPS.has(a.getName())) continue;
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}
await doc.transform(prune());
await io.write(dst, doc);

const bytes = readFileSync(dst);
const final = [...out.values()].reduce((s, d) => s + d.indices.length / 3, 0);
console.log(JSON.stringify({
  src, sourceSha256: createHash("sha256").update(readFileSync(src)).digest("hex"), dst, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length,
  sourceTriangles, droppedTriangles, targetTriangles: TARGET_TRIANGLES, triangles: final, drawCalls: out.size, groups: report,
  clips: root.listAnimations().map((a) => a.getName()),
}, null, 1));
