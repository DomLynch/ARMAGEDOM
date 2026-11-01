// Perseus (Mixamo ch42, OpenTrident models/custom/ch42-nonpbr-full-phone-mixamorig.glb) as an ARMAGEDOM 106-rig body. CPU only (gltf-transform), run on the VPS.
// usage: node build-perseus.mjs <ch42-nonpbr-full-phone-mixamorig.glb> <hunter-pitborn-106.glb> <out.glb>
// - keeps the 106-joint skeleton, bind pose and the nine game clips untouched (appearance only)
// - drops the Layer_* gear nodes (tunic, helmet, bracers, greaves, sword, scabbard) and the three Stress_* test clips
// - adds the seven roles Perseus lacks (Return, Riposte, Parry, BlockImpact, Deflected, StrafeLeft, StrafeRight) from the hunter's clips, delta-retargeted
//   to his rest pose (q = restPerseus * inverse(restHunter) * qHunter; the Hips translation scaled by the hips-height ratio), same 106 skeleton names
// - textures (512 px PNG) re-encoded as WebP q85 to stay under the body KB budget, then meshopt medium
import { createRequire } from "node:module";
const req = createRequire("C:/arma-work/tools/gltf/package.json");
const { NodeIO } = req("@gltf-transform/core");
const { ALL_EXTENSIONS } = req("@gltf-transform/extensions");
const { prune, dedup, meshopt, textureCompress } = req("@gltf-transform/functions");
const sharp = req("sharp");
const { MeshoptDecoder, MeshoptEncoder } = req("meshoptimizer");
const [, , bodyPath, hunterPath, outPath] = process.argv;
const KEEP = ["Idle", "Walk", "Run", "Attack", "Guard", "Roll", "Hit", "Death", "Heavy"],
  BORROW = ["Return", "Riposte", "Parry", "BlockImpact", "Deflected", "StrafeLeft", "StrafeRight"];
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
const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const conj = (q) => [-q[0], -q[1], -q[2], q[3]];
const hunter = await io.read(hunterPath);
const nodeByName = (d) => new Map(d.getRoot().listNodes().map((n) => [n.getName(), n]));
const mine = nodeByName(doc), theirs = nodeByName(hunter);
const hipsRatio = mine.get("mixamorig:Hips").getTranslation()[2] / theirs.get("mixamorig:Hips").getTranslation()[2];
const buffer = root.listBuffers()[0];
for (const name of BORROW) {
  const src = hunter.getRoot().listAnimations().find((a) => a.getName() === name);
  if (!src) throw Error("hunter clip missing: " + name);
  const anim = doc.createAnimation(name);
  for (const ch of src.listChannels()) {
    const sNode = ch.getTargetNode(), target = mine.get(sNode.getName()), path = ch.getTargetPath();
    if (!target) throw Error("no joint " + sNode.getName());
    const sampler = ch.getSampler(), tIn = sampler.getInput(), tOut = sampler.getOutput(), n = tIn.getCount();
    const times = new Float32Array(n), width = path === "rotation" ? 4 : 3, values = new Float32Array(n * width), el = [];
    for (let i = 0; i < n; i++) {
      times[i] = tIn.getScalar(i);
      tOut.getElement(i, el);
      let v = el.slice(0, width);
      if (path === "rotation") v = mul(mul(target.getRotation(), conj(sNode.getRotation())), v);
      else if (path === "translation") v = v.map((x) => x * hipsRatio);
      values.set(v, i * width);
    }
    const input = doc.createAccessor().setType("SCALAR").setArray(times).setBuffer(buffer);
    const output = doc.createAccessor().setType(path === "rotation" ? "VEC4" : "VEC3").setArray(values).setBuffer(buffer);
    const smp = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(sampler.getInterpolation());
    anim.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(path).setSampler(smp));
  }
}
if (!root.listNodes().some((n) => n.getName() === "fk_socket_hand_r")) throw Error("no fk_socket_hand_r");
// Mixamo exports metallicFactor 1 with no metal map: with no env map that renders dark brown, so the body is a plain dielectric.
for (const mat of doc.getRoot().listMaterials()) if (mat.getMetallicFactor() === 1) mat.setMetallicFactor(0).setRoughnessFactor(0.7);
// The Surgeon holds a runtime-built bone saw (engine/bone-saw-view.js): it takes the place of the WeaponDrawn grip node, so bake an empty one under the hand socket, tilted (the quaternion is the per-weapon hand offset: the saw blade points 15 degrees inside and 28 degrees below the thrust line at the Riposte active pose, so its line crosses the player centre, tests/donor-motion.test.js).
root.listNodes().find((n) => n.getName() === "fk_socket_hand_r").addChild(doc.createNode("WeaponDrawn").setRotation([0.3392, 0, -0.5725, 0.7465]));
await doc.transform(prune({ keepLeaves: true }), dedup(), textureCompress({ encoder: sharp, targetFormat: "webp", quality: 85 }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(outPath, doc);
console.log("clips", have.join(","), "nodes", root.listNodes().length);
