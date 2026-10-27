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
// The body is a fanged ogre-like head with no horns, which does not read as a minotaur at game distance. Add a pair of bull horns as a
// plain mesh child of the Head bone (no skin, skeleton untouched), in the Head bone's own frame (x sideways, y up, z forward, skull
// x +-0.11, y -0.035 to 0.201, z -0.096 to 0.156, measured with headbox.html). Ivory base fading to a dark tip by vertex colour.
const head = root.listNodes().find((n) => n.getName() === "mixamorig:Head");
if (!head) throw Error("no mixamorig:Head");
const HORN = Number(process.env.HORN ?? 1.45); // 1.0 read as a small white blob from the game camera (steep, 100 px tall hunter)
const pos = [], nrm = [], col = [], idx = [];
const RING = 10, STEPS = 18;
const bez = (a, b, c, t) => a.map((_, i) => (1 - t) * (1 - t) * a[i] + 2 * (1 - t) * t * b[i] + t * t * c[i]);
const dbez = (a, b, c, t) => a.map((_, i) => 2 * (1 - t) * (b[i] - a[i]) + 2 * t * (c[i] - b[i]));
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
for (const s of [1, -1]) {
  const P0 = [s * 0.075, 0.12, 0.01];
  const grow = (p) => p.map((v, i) => P0[i] + (v - P0[i]) * HORN); // HORN scales the length and sweep, not the skull anchor
  const P1 = grow([s * 0.25, 0.14, 0.0]), P2 = grow([s * 0.27, 0.37, 0.07]); // little forward sweep: more than this reads as a unicorn from the side
  const base = pos.length / 3;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS, c = bez(P0, P1, P2, t), tan = norm(dbez(P0, P1, P2, t));
    const ref = Math.abs(tan[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(tan, ref)), w = cross(tan, u);
    const r = 0.036 * Math.pow(1 - t, 0.85) + 0.004;
    const shade = Math.pow(t, 1.1); // 0 at the base, 1 at the tip
    for (let k = 0; k < RING; k++) {
      const a = (k / RING) * Math.PI * 2, d = [Math.cos(a) * u[0] + Math.sin(a) * w[0], Math.cos(a) * u[1] + Math.sin(a) * w[1], Math.cos(a) * u[2] + Math.sin(a) * w[2]];
      const rr = r * Math.pow(HORN, 0.8);
      pos.push(c[0] + d[0] * rr, c[1] + d[1] * rr, c[2] + d[2] * rr);
      nrm.push(...d);
      col.push(0.9 - 0.62 * shade, 0.84 - 0.64 * shade, 0.7 - 0.55 * shade, 1);
    }
  }
  for (let i = 0; i < STEPS; i++)
    for (let k = 0; k < RING; k++) {
      const a = base + i * RING + k, b = base + i * RING + ((k + 1) % RING), c2 = a + RING, d2 = b + RING;
      if (s > 0) idx.push(a, b, c2, b, d2, c2); else idx.push(a, c2, b, b, c2, d2);
    }
}
const hornBuffer = root.listBuffers()[0];
const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(hornBuffer);
const hornMaterial = doc.createMaterial("Horn").setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.5).setMetallicFactor(0);
const hornPrim = doc.createPrimitive()
  .setAttribute("POSITION", acc("VEC3", new Float32Array(pos)))
  .setAttribute("NORMAL", acc("VEC3", new Float32Array(nrm)))
  .setAttribute("COLOR_0", acc("VEC4", new Float32Array(col)))
  .setIndices(acc("SCALAR", new Uint16Array(idx)))
  .setMaterial(hornMaterial);
const hornNode = doc.createNode("Horns").setMesh(doc.createMesh("Horns").addPrimitive(hornPrim));
head.addChild(hornNode);
const [buffer, ...extra] = root.listBuffers(); // the merge brought the cleaver's buffer; a GLB takes one
for (const a of root.listAccessors()) a.setBuffer(buffer);
for (const b of extra) b.dispose();
await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(outPath, doc);
const s = root.listNodes().filter((n) => n.getMesh()).map((n) => n.getName());
console.log("OK", outPath, "clips", root.listAnimations().length, "mesh nodes", s.join(","), "skins", root.listSkins().map((k) => k.listJoints().length).join(","));
