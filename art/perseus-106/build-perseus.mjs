// Perseus (Mixamo ch42, OpenTrident models/custom/ch42-nonpbr-full-phone-mixamorig.glb) as an ARMAGEDOM 106-rig body. CPU only (gltf-transform), run on the VPS.
// usage: node build-perseus.mjs <ch42-nonpbr-full-phone-mixamorig.glb> <out.glb>
// - keeps the 106-joint skeleton, bind pose and the nine game clips untouched (appearance only)
// - drops the Layer_* gear nodes (tunic, helmet, bracers, greaves, sword, scabbard) and the three Stress_* test clips
// - packs with meshopt; textures stay as embedded (TEX=1024 resizes them for the phone variant)
import { createRequire } from "node:module";
const req = createRequire("/usr/lib/node_modules/@gltf-transform/cli/package.json");
const { NodeIO } = req("@gltf-transform/core");
const { ALL_EXTENSIONS } = req("@gltf-transform/extensions");
const { prune, dedup, meshopt, textureCompress } = req("@gltf-transform/functions");
const { MeshoptDecoder, MeshoptEncoder } = req("meshoptimizer");
const [, , bodyPath, outPath] = process.argv;
const KEEP = ["Idle", "Walk", "Run", "Attack", "Guard", "Roll", "Hit", "Death", "Heavy"];
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(bodyPath);
const root = doc.getRoot();
for (const a of root.listAnimations()) if (!KEEP.includes(a.getName())) a.dispose();
for (const n of root.listNodes()) if (n.getName().startsWith("Layer_")) n.dispose();
const have = root.listAnimations().map((a) => a.getName());
const missing = KEEP.filter((k) => !have.includes(k));
if (missing.length) throw Error("clips missing: " + missing);
if (!root.listNodes().some((n) => n.getName() === "fk_socket_hand_r")) throw Error("no fk_socket_hand_r");
await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(outPath, doc);
console.log("clips", have.join(","), "nodes", root.listNodes().length);
