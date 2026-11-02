// Second pass over a GLB that build-boss-meshopt.mjs already produced: smaller colour maps and narrower vertex attributes. Meshes
// keep their vertex order, index order, positions and skeleton; animation is untouched (exact index order is kept, as in the build).
// usage: node tune-glb.mjs <src.glb> <dst.glb> '<json>'
//   json: {
//     "textures": { "<material name>[:base|normal|mr|occ]": { "size": 1024, "quality": 88 } },
//        that map of the material (base colour by default) is resized so its longest side is `size` (Lanczos, never enlarged) and stored
//        as lossy WebP at `quality` (data maps that are JPEG stay JPEG); a map exactly `size` wide is only re-encoded; smaller maps are
//        skipped.
//     "quantize": true
//        NORMAL -> int8 normalized (renormalised on read), WEIGHTS_n -> uint16 normalized (uint8 with "weightBits": 8; the largest weight absorbs
//        the rounding so each vertex still sums to 1), COLOR_n -> uint8 normalized, TEXCOORD_n -> uint16 normalized when every value is in [0, 1]. The
//        boss and salamander files already store NORMAL and WEIGHTS_0 this way (KHR_mesh_quantization). The largest error of each
//        is printed.
//   }
import { NodeIO, Primitive } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [src, dst, spec] = process.argv.slice(2);
if (!src || !dst || !spec) throw Error("usage: node tune-glb.mjs <src.glb> <dst.glb> '<json>'");
const plan = JSON.parse(spec);
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(src);
const root = doc.getRoot();

const textures = [],
  resized = new Set();
const SLOTS = {
  base: (m) => m.getBaseColorTexture(),
  normal: (m) => m.getNormalTexture(),
  mr: (m) => m.getMetallicRoughnessTexture(),
  occ: (m) => m.getOcclusionTexture(),
};
for (const material of root.listMaterials())
  for (const [key, row] of Object.entries(plan.textures ?? {})) {
    const [name, slot = "base"] = key.split(":");
    const texture = name === material.getName() ? SLOTS[slot](material) : null;
    // A map shared by several materials or slots is re-encoded once.
    if (!texture || resized.has(texture)) continue;
    const before = texture.getImage().length,
      meta = await sharp(Buffer.from(texture.getImage())).metadata();
    if (Math.max(meta.width, meta.height) < row.size) continue;
    resized.add(texture);
    const scale = Math.min(1, row.size / Math.max(meta.width, meta.height)),
      [w, h] = [Math.round(meta.width * scale), Math.round(meta.height * scale)],
      source = sharp(Buffer.from(texture.getImage())).resize(w, h, { kernel: "lanczos3" }),
      // A JPEG stays a JPEG (data maps, as in the build); everything else becomes lossy WebP.
      keepJpeg = texture.getMimeType() === "image/jpeg" && slot !== "base",
      image = keepJpeg
        ? await source.jpeg({ quality: row.quality, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer()
        : await source.webp({ quality: row.quality, effort: 6 }).toBuffer();
    texture.setImage(new Uint8Array(image)).setMimeType(keepJpeg ? "image/jpeg" : "image/webp");
    textures.push({ map: key, from: `${meta.width}x${meta.height} ${before}`, to: `${w}x${h} ${image.length}` });
  }
if (textures.length && !root.listExtensionsUsed().some((e) => e.extensionName === "EXT_texture_webp")) doc.createExtension(EXTTextureWebP).setRequired(true);

const errors = { normalDeg: 0, weight: 0, color: 0, uv: 0 },
  quantized = {};
if (plan.quantize) {
  const done = new Set();
  const swap = (accessor, array, name) => {
    accessor.setArray(array).setNormalized(true);
    quantized[name] = (quantized[name] ?? 0) + 1;
  };
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives())
      for (const semantic of prim.listSemantics()) {
        const accessor = prim.getAttribute(semantic);
        if (done.has(accessor) || accessor.getComponentType() !== 5126 || plan.skip?.some((s) => semantic.startsWith(s))) continue;
        done.add(accessor);
        const a = accessor.getArray(),
          n = accessor.getElementSize();
        if (semantic === "NORMAL") {
          const q = new Int8Array(a.length);
          for (let i = 0; i < a.length; i += 3) {
            const len = Math.hypot(a[i], a[i + 1], a[i + 2]) || 1,
              c = [0, 1, 2].map((k) => Math.round(Math.max(-1, Math.min(1, a[i + k] / len)) * 127));
            q.set(c, i);
            const ql = Math.hypot(c[0], c[1], c[2]) || 1,
              dot = (a[i] * c[0] + a[i + 1] * c[1] + a[i + 2] * c[2]) / (len * ql);
            errors.normalDeg = Math.max(errors.normalDeg, (Math.acos(Math.min(1, dot)) * 180) / Math.PI);
          }
          swap(accessor, q, "NORMAL");
        } else if (semantic.startsWith("WEIGHTS_")) {
          // 16-bit by default: 8-bit weights moved a posed vertex enough to flip a railgun trace in the creature attack matrix.
          const max = plan.weightBits === 8 ? 255 : 65535,
            q = max === 255 ? new Uint8Array(a.length) : new Uint16Array(a.length);
          for (let i = 0; i < a.length; i += 4) {
            let sum = 0,
              big = 0;
            for (let k = 0; k < 4; k++) {
              q[i + k] = Math.round(Math.max(0, Math.min(1, a[i + k])) * max);
              sum += q[i + k];
              if (q[i + k] > q[i + big]) big = k;
            }
            if (sum > 0) q[i + big] += max - sum;
            for (let k = 0; k < 4; k++) errors.weight = Math.max(errors.weight, Math.abs(q[i + k] / max - a[i + k]));
          }
          swap(accessor, q, semantic);
        } else if (semantic.startsWith("COLOR_")) {
          const q = new Uint8Array(a.length);
          if (a.every((v) => v >= 0 && v <= 1)) {
            for (let i = 0; i < a.length; i++) {
              q[i] = Math.round(a[i] * 255);
              errors.color = Math.max(errors.color, Math.abs(q[i] / 255 - a[i]));
            }
            swap(accessor, q, semantic);
          }
        } else if (semantic.startsWith("TEXCOORD_") && n === 2 && a.every((v) => v >= 0 && v <= 1)) {
          const q = new Uint16Array(a.length);
          for (let i = 0; i < a.length; i++) {
            q[i] = Math.round(a[i] * 65535);
            errors.uv = Math.max(errors.uv, Math.abs(q[i] / 65535 - a[i]));
          }
          swap(accessor, q, semantic);
        }
      }
  if (Object.keys(quantized).length && !root.listExtensionsUsed().some((e) => e.extensionName === "KHR_mesh_quantization"))
    doc.createExtension(KHRMeshQuantization).setRequired(true);
}
if (!root.listExtensionsUsed().some((e) => e.extensionName === "EXT_meshopt_compression"))
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

const triangleMode = Primitive.Mode.TRIANGLES;
Primitive.Mode.TRIANGLES = -1;
let written;
try {
  written = await io.writeBinary(doc);
} finally {
  Primitive.Mode.TRIANGLES = triangleMode;
}
const out = Buffer.from(written),
  sha = (b) => createHash("sha256").update(b).digest("hex"),
  before = readFileSync(src);
writeFileSync(dst, out);
console.log(
  JSON.stringify({ src, srcBytes: before.length, srcSha256: sha(before), dst, bytes: out.length, sha256: sha(out), saved: +(1 - out.length / before.length).toFixed(4), textures, quantized, maxError: errors }),
);
