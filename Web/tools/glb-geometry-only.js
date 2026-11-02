// The GLB without its textures, parsed by three's GLTFLoader in plain node (no image decoder there, and skeleton + skinned geometry is all the
// physics tools and tests need): the JSON chunk loses its images, textures and every material texture slot; the binary chunk is kept byte for byte.
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const geometryOnly = (raw) => {
  const jsonLen = raw.readUInt32LE(12),
    json = JSON.parse(raw.subarray(20, 20 + jsonLen).toString()),
    rest = raw.subarray(20 + jsonLen);
  for (const k of ["images", "textures", "samplers"]) delete json[k];
  for (const k of ["extensionsRequired", "extensionsUsed"]) json[k] = (json[k] ?? []).filter((e) => !/texture|materials/i.test(e));
  json.materials = (json.materials ?? []).map((m) => ({ name: m.name, doubleSided: m.doubleSided }));
  let text = JSON.stringify(json);
  text += " ".repeat((4 - (text.length % 4)) % 4);
  const head = Buffer.alloc(20);
  raw.copy(head, 0, 0, 20);
  head.writeUInt32LE(Buffer.byteLength(text), 12);
  const out = Buffer.concat([head, Buffer.from(text), rest]);
  out.writeUInt32LE(out.length, 8);
  return out;
};

// `url` is a file URL or path of the .glb; resolves to the parsed glTF (scene, skinned meshes, skeletons).
export async function loadGeometryOnly(url) {
  const raw = geometryOnly(readFileSync(url));
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), "");
}
