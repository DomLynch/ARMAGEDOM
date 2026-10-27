// Marked hunter body = V3's Pitborn on the 106 Mixamo rig. CPU only (gltf-transform), run on the VPS.
// usage: node build-hunter.mjs <minotaur-106-v3-web.glb> <pitborn-cleaver-phone.glb> <out.glb>
// - keeps the skeleton, bind pose and the clips the hunter's manifest roles use (the Pitborn's clip names are the hunter's)
// - drops the empty Layer_* gear nodes and the 8 finisher/special clips the hunter never plays
// - bakes the Pitborn's cleaver (ARMAGEDOM's weapons/pitborn-cleaver-phone.glb) under fk_socket_hand_r, which carries the 65-rig
//   WeaponDrawn grip frame, as a node named WeaponDrawn with identity transform
import { createRequire } from "node:module";
const req = createRequire("/usr/lib/node_modules/@gltf-transform/cli/package.json");
const { NodeIO } = req("@gltf-transform/core");
const { ALL_EXTENSIONS } = req("@gltf-transform/extensions");
const { prune, dedup, meshopt, mergeDocuments } = req("@gltf-transform/functions");
const { MeshoptDecoder, MeshoptEncoder } = req("meshoptimizer");
const [, , bodyPath, cleaverPath, outPath] = process.argv;
const KEEP = ["Armed", "ArmedWalk", "Run", "Attack", "Return", "Riposte", "Heavy", "Guard", "Roll", "Hit", "Death", "Parry", "BlockImpact", "Deflected", "StrafeLeft", "StrafeRight"];
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(bodyPath);
const root = doc.getRoot();
for (const a of root.listAnimations()) if (!KEEP.includes(a.getName())) a.dispose();
for (const n of root.listNodes()) if (n.getName().startsWith("Layer_")) n.dispose();
const have = root.listAnimations().map((a) => a.getName());
const missing = KEEP.filter((k) => !have.includes(k));
if (missing.length) throw Error("clips missing: " + missing);
const socket = root.listNodes().find((n) => n.getName() === "fk_socket_hand_r");
if (!socket) throw Error("no fk_socket_hand_r");
const before = new Set(root.listNodes());
mergeDocuments(doc, await io.read(cleaverPath));
const added = root.listNodes().filter((n) => !before.has(n));
const parts = added.filter((n) => /^WeaponDrawn_\d+$/.test(n.getName()) && n.getMesh());
if (parts.length !== 2) throw Error("expected two cleaver parts, got " + parts.length);
const grip = doc.createNode("WeaponDrawn");
socket.addChild(grip);
for (const p of parts) { p.getParentNode()?.removeChild(p); grip.addChild(p); }
for (const n of added) if (!parts.includes(n)) n.dispose();
for (const s of root.listScenes()) if (!s.listChildren().length) s.dispose();
const [buffer, ...extra] = root.listBuffers(); // the merge brought the cleaver's buffer; a GLB takes one
for (const a of root.listAccessors()) a.setBuffer(buffer);
for (const b of extra) b.dispose();
await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(outPath, doc);
const s = root.listNodes().filter((n) => n.getMesh()).map((n) => n.getName());
console.log("OK", outPath, "clips", root.listAnimations().length, "mesh nodes", s.join(","), "skins", root.listSkins().map((k) => k.listJoints().length).join(","));
