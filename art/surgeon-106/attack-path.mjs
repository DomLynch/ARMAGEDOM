// Bakes the Lambeth Surgeon saw path (boss-surgeon-attack in world/area-content.json) from the Surgeon GLB own Attack clip.
// usage: node attack-path.mjs <boss-surgeon.glb> <manifest scale> <area-content.json>   (rewrites the boss-surgeon-attack rows in place)
// NOTE: the saw is not in the GLB; BASE/TIP are the saw grip and tip in the fk_socket_hand_r frame (tune with the saw hand offset). Run, then set the surgeon profile contactScale to 1 (the path already carries the manifest scale).
// One row per tick (windup+active+recovery+1): [baseX, baseY, baseZ, tipX, tipY, tipZ] of the sword blade in model space times the manifest scale,
// sampled at clip time = tick / total * duration (native swings play the clip linearly over the whole attack).
import { createRequire } from "node:module";
import fs from "node:fs";
const req = createRequire("C:/arma-work/tools/gltf/package.json");
const { NodeIO } = req("@gltf-transform/core");
const { ALL_EXTENSIONS } = req("@gltf-transform/extensions");
const { MeshoptDecoder } = req("meshoptimizer");
const [, , glb, scaleText, contentPath] = process.argv;
const TOTAL = 80, BASE = [0, 0.1, 0], TIP = [0, 0.7, 0], scale = Number(scaleText);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const root = (await io.read(glb)).getRoot();
const clip = root.listAnimations().find((a) => a.getName() === "Attack");
const sword = root.listNodes().find((n) => n.getName() === "fk_socket_hand_r");
const slerp = (a, b, t) => {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  d *= s;
  const o = b.map((v) => v * s);
  if (d > 0.9995) {
    const r = a.map((v, i) => v + (o[i] - v) * t);
    const l = Math.hypot(...r);
    return r.map((v) => v / l);
  }
  const th = Math.acos(d), w1 = Math.sin((1 - t) * th) / Math.sin(th), w2 = Math.sin(t * th) / Math.sin(th);
  return a.map((v, i) => v * w1 + o[i] * w2);
};
const duration = Math.max(...clip.listSamplers().map((s) => s.getInput().getMax([])[0]));
const sample = (ch, time) => {
  const smp = ch.getSampler(), tin = smp.getInput(), out = smp.getOutput(), n = tin.getCount(), w = ch.getTargetPath() === "rotation" ? 4 : 3;
  let i = 0;
  while (i < n - 2 && tin.getScalar(i + 1) <= time) i++;
  const j = Math.min(i + 1, n - 1), t0 = tin.getScalar(i), t1 = tin.getScalar(j);
  const k = t1 > t0 ? Math.min(1, Math.max(0, (time - t0) / (t1 - t0))) : 0;
  const a = out.getElement(i, []).slice(0, w), b = out.getElement(j, []).slice(0, w);
  return w === 4 ? slerp(a, b, k) : a.map((v, q) => v + (b[q] - v) * k);
};
const frames = [];
for (let tick = 0; tick <= TOTAL; tick++) {
  const time = (tick / TOTAL) * duration;
  for (const ch of clip.listChannels()) {
    const node = ch.getTargetNode(), v = sample(ch, time);
    if (ch.getTargetPath() === "rotation") node.setRotation(v);
    else if (ch.getTargetPath() === "translation") node.setTranslation(v);
  }
  const m = sword.getWorldMatrix();
  const at = (p) => [0, 1, 2].map((r) => (m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]) * scale);
  frames.push([...at(BASE), ...at(TIP)].map((v) => Number(v.toFixed(4))));
}
const text = fs.readFileSync(contentPath, "utf8"), key = '"boss-surgeon-attack": [', start = text.indexOf(key);
const end = text.indexOf("\n      ]", start) + "\n      ]".length;
const pad = (n) => " ".repeat(n);
const body = frames.map((f) => pad(8) + "[\n" + f.map((v) => pad(10) + v).join(",\n") + "\n" + pad(8) + "]").join(",\n");
fs.writeFileSync(contentPath, text.slice(0, start) + key + "\n" + body + "\n" + pad(6) + "]" + text.slice(end));
console.log(JSON.stringify([frames[0], frames[36], frames[44], frames[80]]));
