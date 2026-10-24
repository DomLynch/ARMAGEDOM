// Shrinks a boss GLB without a visible change in how it looks or moves. Four steps, none of which touches the meshes or the skeleton
// (step 4, below, resamples normal / occlusion / metal-rough maps that are larger than 512 px to 512 px):
//   1. EXT_meshopt_compression: vertex and index buffers and animation keyframes are stored with the meshopt codec and decode to
//      identical values (no quantization filters, no vertex reordering). The game's GLTFLoader already has the decoder
//      (Web/src/actors.js loadActors), and every boss file already declares KHR_mesh_quantization.
//   2. Redundant animation keyframes are dropped (gltf-transform resample, tolerance 1e-4: a key is removed only when linear or
//      spherical interpolation of its neighbours reproduces it within that tolerance).
//   3. PNG textures are re-encoded as lossless WebP (EXT_texture_webp is already used by every boss file): the decoded pixels are
//      identical. JPEG and WebP textures are left as they are.
// Nodes, skins, materials, extras and the remaining textures are untouched.
// usage: node build-boss-meshopt.mjs <src.glb> <dst.glb>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from "@gltf-transform/extensions";
import { resample } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [src, dst] = process.argv.slice(2);
if (!src || !dst) throw Error("usage: node build-boss-meshopt.mjs <src.glb> <dst.glb>");
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(src);

const TOLERANCE = Number(process.env.RESAMPLE_TOLERANCE ?? 1e-4);
await doc.transform(resample({ tolerance: TOLERANCE }));

// Data maps (normal, occlusion, metal-rough) larger than 512 are resampled to 512, as for the player and the hollow scavenger
// (art/phone-texture): they shade a surface that is a few dozen pixels tall on a phone. Colour maps keep their size.
const COLOUR = new Set(),
  DATA = new Set();
for (const m of doc.getRoot().listMaterials()) {
  for (const t of [m.getBaseColorTexture(), m.getEmissiveTexture()]) if (t) COLOUR.add(t);
  for (const t of [m.getNormalTexture(), m.getOcclusionTexture(), m.getMetallicRoughnessTexture()]) if (t) DATA.add(t);
}
let capped = 0;
for (const texture of DATA) {
  const [w, h] = texture.getSize();
  // Skip colour maps, maps already 512 or less, and thin strips (ramps) that are not worth touching.
  if (COLOUR.has(texture) || Math.max(w, h) <= 512 || Math.min(w, h) < 512) continue;
  const mime = texture.getMimeType(),
    scale = 512 / Math.max(w, h),
    resized = sharp(Buffer.from(texture.getImage())).resize(Math.round(w * scale), Math.round(h * scale), { kernel: "lanczos3" });
  const image =
    mime === "image/jpeg" ? resized.jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true }) : mime === "image/webp" ? resized.webp({ quality: 92, effort: 6 }) : resized.png({ compressionLevel: 9 });
  texture.setImage(new Uint8Array(await image.toBuffer()));
  capped++;
}

let pngToWebp = 0;
for (const texture of doc.getRoot().listTextures()) {
  if (texture.getMimeType() !== "image/png") continue;
  const png = Buffer.from(texture.getImage()),
    webp = await sharp(png).webp({ lossless: true, effort: 6 }).toBuffer();
  if (webp.length >= png.length) continue; // keep the PNG when WebP would not be smaller
  texture.setImage(new Uint8Array(webp)).setMimeType("image/webp");
  pngToWebp++;
}
if (pngToWebp) doc.createExtension(EXTTextureWebP).setRequired(true);

// Only the codec: gltf-transform's meshopt() transform would also reorder vertices and quantize positions, which this must not do.
// Compression happens when the document is written; the QUANTIZE method applies no attribute filters, so values are stored exactly.
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

const out = Buffer.from(await io.writeBinary(doc));
writeFileSync(dst, out);
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  before = readFileSync(src);
console.log(
  JSON.stringify({ src, srcBytes: before.length, srcSha256: sha(before), dst, bytes: out.length, sha256: sha(out), saved: +(1 - out.length / before.length).toFixed(4), pngToWebp, capped }),
);
