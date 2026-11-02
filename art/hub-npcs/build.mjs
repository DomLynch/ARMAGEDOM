// Builds one hub NPC GLB from an OpenTrident MakeHuman NPC body (106-joint Mixamo rig): drops every clip, retargets ONE Mixamo idle clip onto the
// body (grade "none" here, the bodies are already coloured), prunes and re-applies meshopt. Reused from the unmerged origin/art/hub-npcs branch.
// usage (VPS, repo root): node art/hub-npcs/build.mjs <body.glb> <mixamo-clip.glb> <dst.glb> '<grade json>' [hipsDy metres]
//
// Retarget: the body's rest pose is not the Mixamo T pose (arms and bone axes differ by up to 90 degrees), so the clip is retargeted by
// direction, not by raw local copy. Hips: world-frame delta of the clip applied to the body's hips (position scaled by the hips-height
// ratio). Every other body bone aims its bone vector (bone -> child) at the clip's posed bone vector and keeps the clip's roll (twist about the
// bone axis). Fingers and toes keep their rest pose. Per-frame, then resampled.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const require = createRequire("/usr/lib/node_modules/@gltf-transform/cli/package.json");
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { prune, dedup, meshopt, resample } = require("@gltf-transform/functions");
const { MeshoptDecoder, MeshoptEncoder } = require("meshoptimizer");
const [bodyPath, clipPath, dst, grade, hipsDyArg = "0"] = process.argv.slice(2);
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(bodyPath);
const root = doc.getRoot();
const clipDoc = await io.read(clipPath);

// --- math (quaternions are [x, y, z, w]) ---
const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const inv = (q) => [-q[0], -q[1], -q[2], q[3]];
const norm = (q) => {
  const l = Math.hypot(...q);
  return q.map((v) => v / l);
};
const rot = (q, v) => {
  const p = mul(mul(q, [v[0], v[1], v[2], 0]), inv(q));
  return [p[0], p[1], p[2]];
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};
const axisAngle = (axis, ang) => {
  const s = Math.sin(ang / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(ang / 2)];
};
// Shortest-arc rotation taking unit vector a to unit vector b.
const arc = (a, b) => {
  const d = dot(a, b);
  if (d < -0.999999) {
    const ax = unit(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]));
    return axisAngle(ax, Math.PI);
  }
  return norm([...cross(a, b), 1 + d]);
};
const twistAbout = (q, axis) => 2 * Math.atan2(dot([q[0], q[1], q[2]], axis), q[3]);

// --- skeleton access: world rotation and position of any node for a given local-rotation function ---
const nodeMap = (d) => new Map(d.getRoot().listNodes().map((n) => [n.getName(), n]));
const bodyNodes = nodeMap(doc),
  clipNodes = nodeMap(clipDoc);
function worldOf(node, localRot, localPos) {
  const chain = [];
  for (let n = node; n; n = n.getParentNode()) chain.unshift(n);
  let q = [0, 0, 0, 1],
    p = [0, 0, 0];
  for (const n of chain) {
    p = add(p, rot(q, localPos(n)));
    q = mul(q, localRot(n));
  }
  return { q, p };
}
const restRot = (n) => n.getRotation(),
  restPos = (n) => n.getTranslation();
const skip = (name) => /Hand(Index|Middle|Pinky|Ring|Thumb)\d|ToeBase|HeadTop|_end/i.test(name);

const hipsName = "mixamorig:Hips";
const bHips = bodyNodes.get(hipsName),
  cHips = clipNodes.get(hipsName);
const hipsParent = (hips) => worldOf(hips.getParentNode(), restRot, restPos).q;
const Pb = hipsParent(bHips),
  Pc = hipsParent(cHips);
const k = rot(Pb, bHips.getTranslation())[1] / rot(Pc, cHips.getTranslation())[1];
const hipsDy = Number(hipsDyArg);

// Retarget bones: Mixamo-named, present in both rigs, not fingers/toes. Parent-first order.
const order = [];
const visit = (n) => {
  if (n.getName().startsWith("mixamorig:") && bodyNodes.has(n.getName()) && !skip(n.getName())) order.push(n.getName());
  for (const c of n.listChildren()) visit(c);
};
visit(cHips);
// Child used for the bone direction: the first Mixamo child present in both rigs (fingers count: they fix the hand direction).
const childOf = (name) => {
  const kids = clipNodes.get(name).listChildren().filter((c) => c.getName().startsWith("mixamorig:") && bodyNodes.has(c.getName()));
  const pref = kids.find((c) => !skip(c.getName())) ?? kids.find((c) => /Middle1/.test(c.getName())) ?? kids[0];
  return pref?.getName() ?? null;
};

// Clip tracks by node name.
const clip = clipDoc.getRoot().listAnimations()[0];
const track = new Map();
let times = null;
for (const ch of clip.listChannels()) {
  const s = ch.getSampler();
  track.set(ch.getTargetNode().getName() + "." + ch.getTargetPath(), s.getOutput());
  if (ch.getTargetPath() === "rotation") {
    if (times && s.getInput().getCount() !== times.getCount()) throw new Error("clip channels do not share keyframes");
    times = s.getInput();
  }
}
const N = times.getCount();

// Rest data of the body (constant).
const bodyRest = new Map();
for (const name of order) bodyRest.set(name, worldOf(bodyNodes.get(name), restRot, restPos));
const bodyRestChild = new Map();
for (const name of order) {
  const c = childOf(name);
  if (c) bodyRestChild.set(name, worldOf(bodyNodes.get(c), restRot, restPos));
}
const clipRest = new Map();
for (const name of [...order, ...order.map(childOf).filter(Boolean)]) clipRest.set(name, worldOf(clipNodes.get(name), restRot, restPos));

for (const anim of root.listAnimations()) anim.dispose();
const out = doc.createAnimation("Idle");
const outRot = new Map(order.map((n) => [n, new Float32Array(N * 4)]));
const hipsT = new Float32Array(N * 3);
const prevQ = new Map();
for (let i = 0; i < N; i++) {
  const poseRot = (n) => {
    const v = track.get(n.getName() + ".rotation");
    return v ? v.getElement(i, [0, 0, 0, 1]) : n.getRotation();
  };
  const posePos = (n) => {
    const v = n.getName() === hipsName ? track.get(hipsName + ".translation") : null;
    return v ? v.getElement(i, [0, 0, 0]) : n.getTranslation();
  };
  const target = new Map(); // world rotation of each body bone this frame
  const parentTarget = (bn) => {
    // World rotation of the body node's parent this frame: retargeted bone, else its rest world rotation.
    const p = bn.getParentNode();
    if (!p) return [0, 0, 0, 1];
    return target.get(p.getName()) ?? worldOf(p, restRot, restPos).q;
  };
  for (const name of order) {
    const bn = bodyNodes.get(name);
    const cpose = worldOf(clipNodes.get(name), poseRot, posePos);
    let Wt;
    if (name === hipsName) {
      const D = mul(cpose.q, inv(clipRest.get(name).q)); // world-frame delta of the clip's hips
      Wt = mul(D, bodyRest.get(name).q);
    } else {
      const cn = childOf(name);
      const crest = clipRest.get(name);
      let dRestB, dPose, dRestC;
      if (cn) {
        const cposeChild = worldOf(clipNodes.get(cn), poseRot, posePos);
        dPose = unit(sub(cposeChild.p, cpose.p));
        dRestB = unit(sub(bodyRestChild.get(name).p, bodyRest.get(name).p));
        dRestC = unit(sub(clipRest.get(cn).p, crest.p));
      } else {
        dPose = rot(cpose.q, [0, 1, 0]);
        dRestB = rot(bodyRest.get(name).q, [0, 1, 0]);
        dRestC = rot(crest.q, [0, 1, 0]);
      }
      const Dc = mul(cpose.q, inv(crest.q));
      const theta = twistAbout(Dc, dRestC);
      const Db = mul(axisAngle(dPose, theta), arc(dRestB, dPose));
      Wt = mul(Db, bodyRest.get(name).q);
    }
    target.set(name, norm(Wt));
    let local = norm(mul(inv(parentTarget(bn)), Wt));
    const prev = prevQ.get(name);
    if (prev && dot4(local, prev) < 0) local = local.map((v) => -v);
    prevQ.set(name, local);
    outRot.get(name).set(local, i * 4);
  }
  const t = rot(Pc, track.get(hipsName + ".translation").getElement(i, [0, 0, 0])).map((v) => v * k);
  t[1] += hipsDy;
  hipsT.set(rot(inv(Pb), t), i * 3);
}
function dot4(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}
const times32 = new Float32Array(times.getArray());
const addTrack = (node, pathName, type, arr) => {
  const accIn = doc.createAccessor().setType("SCALAR").setArray(times32);
  const accOut = doc.createAccessor().setType(type).setArray(arr);
  const sampler = doc.createAnimationSampler().setInterpolation("LINEAR").setInput(accIn).setOutput(accOut);
  out.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(pathName).setSampler(sampler));
};
for (const name of order) addTrack(bodyNodes.get(name), "rotation", "VEC4", outRot.get(name));
addTrack(bHips, "translation", "VEC3", hipsT);

// Grade the base colour atlas of the body material only (the eyebrow and beard cards keep their own colour).
const tmp = mkdtempSync(path.join(tmpdir(), "hubnpc-"));
let graded = 0;
// grade "none": the OpenTrident NPC bodies are already coloured for their roles, so only the clip is swapped.
for (const mat of grade === "none" ? [] : root.listMaterials()) {
  if (mat.getName() !== "Human.body") continue;
  const tex = mat.getBaseColorTexture();
  if (!tex) continue;
  const inp = path.join(tmp, "in.webp"),
    outp = path.join(tmp, "out.webp");
  writeFileSync(inp, tex.getImage());
  execFileSync("python3", [new URL("./grade.py", import.meta.url).pathname, inp, outp, grade]);
  tex.setImage(new Uint8Array(readFileSync(outp))).setMimeType("image/webp");
  graded++;
}
if (grade !== "none" && graded !== 1) throw new Error(`expected 1 graded body atlas, got ${graded}`);
await doc.transform(resample({ tolerance: 0.0005 }), prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
await io.write(dst, doc);
console.log(dst, "k", k.toFixed(4), "bones", order.length, "frames", N, "duration", times.getMax([])[0]);
