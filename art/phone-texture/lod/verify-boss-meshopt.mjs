// Proves a shrunk boss GLB is the same model as its source, apart from the intended differences. Compared after decoding:
//   exact: node tree (names, parents, transforms to 1e-5, extras), skins, every primitive's indices and attributes, materials,
//          animation names and channel targets, colour-map pixels (PNG to lossless WebP must decode to identical RGBA);
//   measured: animation curves (every original key is re-evaluated on the shrunk curve; reports the worst translation error in
//          metres and rotation error in degrees) and the resampled data maps (reports their new size).
// usage: node verify-boss-meshopt.mjs <src.glb> <dst.glb>   (exit 1 when anything that must be exact differs)
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { createHash } from "node:crypto";

const [src, dst] = process.argv.slice(2);
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const [A, B] = [await io.read(src), await io.read(dst)],
  [ra, rb] = [A.getRoot(), B.getRoot()],
  problems = [],
  check = (what, x, y) => x === y || problems.push(`${what}: ${x} vs ${y}`),
  digest = (arr) => (arr ? createHash("sha256").update(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)).digest("hex") : "none"),
  accessor = (a) => (a ? `${a.getType()}/${a.getComponentType()}/${a.getNormalized()}/${a.getCount()}/${digest(a.getArray())}` : "none"),
  near = (u, v, eps = 1e-5) => u.length === v.length && u.every((x, i) => Math.abs(x - v[i]) <= eps);

// The meshopt index codec may rotate a triangle's corners and reorder triangles; the surface is the same set of oriented triangles.
// Compared as a sorted list of corner-rotated triangles (winding kept), so any real change to the mesh still fails.
// By default the index sequence itself must be identical (triangle order and corner order), matching the build's default. Only with
// EXACT_INDICES=0 is the weaker check used: the same set of triangles, corners rotated.
function triangles(p) {
  const ind = p.getIndices()?.getArray();
  if (!ind) return "none";
  if (process.env.EXACT_INDICES !== "0") return `${p.getMode()}/${ind.length}/${digest(ind)}`;
  const list = [];
  for (let k = 0; k < ind.length; k += 3) {
    const t = [ind[k], ind[k + 1], ind[k + 2]],
      r = t.indexOf(Math.min(...t));
    list.push(`${t[r]},${t[(r + 1) % 3]},${t[(r + 2) % 3]}`);
  }
  return `${p.getMode()}/${ind.length}/${createHash("sha256").update(list.sort().join(";")).digest("hex")}`;
}
const index = (root) => new Map(root.listNodes().map((n, i) => [n, i]));
const [ia, ib] = [index(ra), index(rb)];
check("node count", ra.listNodes().length, rb.listNodes().length);
for (const [i, n] of ra.listNodes().entries()) {
  const m = rb.listNodes()[i];
  if (!m) break;
  check(`node ${i} name`, n.getName(), m.getName());
  check(`node ${i} children`, n.listChildren().map((c) => ia.get(c)).join(), m.listChildren().map((c) => ib.get(c)).join());
  check(`node ${i} mesh/skin`, `${n.getMesh()?.getName()}/${!!n.getSkin()}`, `${m.getMesh()?.getName()}/${!!m.getSkin()}`);
  check(`node ${i} extras`, JSON.stringify(n.getExtras()), JSON.stringify(m.getExtras()));
  for (const [what, x, y] of [["t", n.getTranslation(), m.getTranslation()], ["r", n.getRotation(), m.getRotation()], ["s", n.getScale(), m.getScale()]])
    if (!near(x, y)) problems.push(`node ${i} ${what}: ${x} vs ${y}`);
}
check("skins", ra.listSkins().length, rb.listSkins().length);
for (const [i, s] of ra.listSkins().entries()) {
  const t = rb.listSkins()[i];
  if (!t) break;
  check(`skin ${i} joints`, s.listJoints().map((j) => ia.get(j)).join(), t.listJoints().map((j) => ib.get(j)).join());
  check(`skin ${i} inverse binds`, accessor(s.getInverseBindMatrices()), accessor(t.getInverseBindMatrices()));
}
check("meshes", ra.listMeshes().length, rb.listMeshes().length);
let primitives = 0;
for (const [i, m] of ra.listMeshes().entries()) {
  const t = rb.listMeshes()[i];
  if (!t) break;
  check(`mesh ${i} primitives`, m.listPrimitives().length, t.listPrimitives().length);
  for (const [j, p] of m.listPrimitives().entries()) {
    const q = t.listPrimitives()[j];
    if (!q) break;
    primitives++;
    check(`prim ${i}.${j} material`, p.getMaterial()?.getName(), q.getMaterial()?.getName());
    check(`prim ${i}.${j} triangles`, triangles(p), triangles(q));
    check(`prim ${i}.${j} semantics`, p.listSemantics().join(), q.listSemantics().join());
    for (const sem of p.listSemantics()) check(`prim ${i}.${j} ${sem}`, accessor(p.getAttribute(sem)), accessor(q.getAttribute(sem)));
  }
}
for (const [i, m] of ra.listMaterials().entries()) {
  const t = rb.listMaterials()[i];
  check(`material ${i}`, JSON.stringify([m.getName(), m.getBaseColorFactor(), m.getMetallicFactor(), m.getRoughnessFactor(), m.getEmissiveFactor(), m.getAlphaMode(), m.getDoubleSided()]), t && JSON.stringify([t.getName(), t.getBaseColorFactor(), t.getMetallicFactor(), t.getRoughnessFactor(), t.getEmissiveFactor(), t.getAlphaMode(), t.getDoubleSided()]));
}

// Textures: colour maps must decode to identical RGBA; data maps may be resampled (reported).
const COLOUR = new Set();
for (const m of ra.listMaterials()) for (const t of [m.getBaseColorTexture(), m.getEmissiveTexture()]) if (t) COLOUR.add(t);
const rgba = async (t) => (await sharp(Buffer.from(t.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
const textures = [];
check("textures", ra.listTextures().length, rb.listTextures().length);
for (const [i, t] of ra.listTextures().entries()) {
  const u = rb.listTextures()[i];
  if (!u) break;
  const [x, y] = [await rgba(t), await rgba(u)],
    sameSize = x.info.width === y.info.width && x.info.height === y.info.height,
    identical = sameSize && digest(x.data) === digest(y.data);
  textures.push({ i, role: COLOUR.has(t) ? "colour" : "data", from: `${x.info.width}x${x.info.height} ${t.getMimeType()} ${t.getImage().length}`, to: `${y.info.width}x${y.info.height} ${u.getMimeType()} ${u.getImage().length}`, pixelsIdentical: identical });
  // A colour map is exact unless it is a lossy JPEG/WebP that this build did not touch (then its bytes must be identical).
  if (COLOUR.has(t)) check(`colour texture ${i} pixels`, identical || digest(t.getImage()) === digest(u.getImage()), true);
}

// Animations: names and channel targets exact; curves compared at every original key.
const evaluate = (times, values, size, path, at) => {
  let hi = 0;
  while (hi < times.length - 1 && times[hi] < at) hi++;
  if (hi === 0 || times[hi] === at) return Array.from(values.subarray(hi * size, hi * size + size));
  const lo = hi - 1,
    f = (at - times[lo]) / (times[hi] - times[lo]),
    a = values.subarray(lo * size, lo * size + size),
    b = values.subarray(hi * size, hi * size + size);
  if (path !== "rotation") return Array.from(a, (x, k) => x + (b[k] - x) * f);
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const sign = d < 0 ? -1 : 1;
  d = Math.min(1, Math.abs(d));
  const th = Math.acos(d),
    s = Math.sin(th),
    wa = s < 1e-6 ? 1 - f : Math.sin((1 - f) * th) / s,
    wb = s < 1e-6 ? f : Math.sin(f * th) / s;
  return Array.from(a, (x, k) => wa * x + wb * sign * b[k]);
};
let maxTranslation = 0,
  maxRotationDeg = 0,
  keysBefore = 0,
  keysAfter = 0;
check("animations", ra.listAnimations().map((a) => `${a.getName()}:${a.listChannels().length}`).join("|"), rb.listAnimations().map((a) => `${a.getName()}:${a.listChannels().length}`).join("|"));
for (const [i, a] of ra.listAnimations().entries()) {
  const b = rb.listAnimations()[i];
  if (!b) break;
  for (const [k, c] of a.listChannels().entries()) {
    const d = b.listChannels()[k];
    if (!d) break;
    check(`anim ${i} ch ${k} target`, `${ia.get(c.getTargetNode())}/${c.getTargetPath()}/${c.getSampler().getInterpolation()}`, `${ib.get(d.getTargetNode())}/${d.getTargetPath()}/${d.getSampler().getInterpolation()}`);
    const [s, t] = [c.getSampler(), d.getSampler()],
      path = c.getTargetPath(),
      size = path === "rotation" ? 4 : 3;
    if (!["translation", "rotation", "scale"].includes(path) || s.getInterpolation() !== "LINEAR") continue;
    const [ti, vi, tt, vt] = [s.getInput().getArray(), s.getOutput().getArray(), t.getInput().getArray(), t.getOutput().getArray()];
    keysBefore += ti.length;
    keysAfter += tt.length;
    for (let n = 0; n < ti.length; n++) {
      const want = Array.from(vi.subarray(n * size, n * size + size)),
        got = evaluate(tt, vt, size, path, ti[n]);
      if (path === "rotation") {
        const dot = Math.min(1, Math.abs(want.reduce((x, v, q) => x + v * got[q], 0)));
        maxRotationDeg = Math.max(maxRotationDeg, 2 * Math.acos(dot) * (180 / Math.PI));
      } else maxTranslation = Math.max(maxTranslation, ...want.map((v, q) => Math.abs(v - got[q])));
    }
  }
}
console.log(
  JSON.stringify({ src, dst, primitives, animationKeys: { before: keysBefore, after: keysAfter }, maxTranslationError: +maxTranslation.toExponential(2), maxRotationErrorDeg: +maxRotationDeg.toFixed(4), textures, identical: problems.length === 0, problems: problems.slice(0, 8) }),
);
process.exitCode = problems.length ? 1 : 0;
