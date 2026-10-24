// usage: node verify-remote-survivor.mjs <source.glb> <remote-survivor.glb>
// Checks the reduced mesh against the source player model: same joints (names, order, hierarchy, local TRS), same inverse binds, and
// every surviving vertex carries a (joints, weights) pair that exists unchanged on a source vertex of the same position.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { createHash } from "node:crypto";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS),
  [a, b] = await Promise.all(process.argv.slice(2, 4).map((p) => io.read(p)));
const skinOf = (d) => d.getRoot().listNodes().find((n) => n.getSkin() && n.getMesh()).getSkin();
const sa = skinOf(a), sb = skinOf(b), fail = [];
const hash = (arr) => createHash("sha256").update(Buffer.from(new Float32Array(arr).buffer)).digest("hex");
const names = (s) => s.listJoints().map((j) => j.getName());
if (names(sa).join("|") !== names(sb).join("|")) fail.push("joint names/order differ");
if (hash(sa.getInverseBindMatrices().getArray()) !== hash(sb.getInverseBindMatrices().getArray())) fail.push("inverse binds differ");
// gltf-transform's writer omits a bone scale that is within about 1e-5 of 1 (the source has 0.99999988..0.999995 on a few bones);
// anything larger than 1e-5 is a real change.
const trs = (j) => [...j.getTranslation(), ...j.getRotation(), ...j.getScale()];
let maxTrsDiff = 0;
sa.listJoints().forEach((j, i) => {
  const k = sb.listJoints()[i], x = trs(j), y = trs(k), d = Math.max(...x.map((v, n) => Math.abs(v - y[n])));
  maxTrsDiff = Math.max(maxTrsDiff, d);
  if (d > 1e-5) fail.push("joint TRS differs: " + j.getName());
  if ((j.getParentNode()?.getName() ?? "") !== (k.getParentNode()?.getName() ?? "")) fail.push("parent differs: " + j.getName());
});
// source vertex table keyed by position
const table = new Map();
for (const n of a.getRoot().listNodes().filter((n) => n.getMesh() && n.getSkin()))
  for (const p of n.getMesh().listPrimitives()) {
    const pos = p.getAttribute("POSITION"), jnt = p.getAttribute("JOINTS_0"), wgt = p.getAttribute("WEIGHTS_0"), v = [0, 0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v); jnt.getElement(i, j); wgt.getElement(i, w);
      const key = v.map((x) => x.toFixed(6)).join(",");
      (table.get(key) ?? table.set(key, new Set()).get(key)).add(j.join(",") + "|" + w.map((x) => x.toFixed(6)).join(","));
    }
  }
let checked = 0, missing = 0;
for (const n of b.getRoot().listNodes().filter((n) => n.getMesh()))
  for (const p of n.getMesh().listPrimitives()) {
    const pos = p.getAttribute("POSITION"), jnt = p.getAttribute("JOINTS_0"), wgt = p.getAttribute("WEIGHTS_0"), v = [0, 0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v); jnt.getElement(i, j); wgt.getElement(i, w); checked++;
      if (!table.get(v.map((x) => x.toFixed(6)).join(","))?.has(j.join(",") + "|" + w.map((x) => x.toFixed(6)).join(","))) missing++;
    }
  }
if (missing) fail.push(`${missing}/${checked} vertices have no matching source vertex (position + joints + weights)`);
console.log(JSON.stringify({ joints: names(sa).length, maxJointTrsDiff: maxTrsDiff, verticesChecked: checked, vertexMismatches: missing, failures: fail }, null, 1));
process.exit(fail.length ? 1 : 0);
