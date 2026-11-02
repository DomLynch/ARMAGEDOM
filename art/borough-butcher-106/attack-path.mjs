// Bakes the Borough Butcher's cleaver path (boss-butcher-attack in world/area-content.json) from the Warrok GLB's own Attack clip.
// Method and sampler from art/knight-106/attack-path.mjs. usage: node attack-path.mjs <boss-butcher.glb> <area-content.json>
// The cleaver is the baked WeaponDrawn node; its base and tip are the two ends of its longest axis (base = the end nearer the grip origin).
// Rows stay in MODEL space (unscaled, like the old rows): the actor scale rides on the row's contactScale = manifest scale x 1.3225 (combat scale).
// One row per tick (windup + active + recovery + 1): [baseX, baseY, baseZ, tipX, tipY, tipZ], sampled at clip time = tick / total * duration
// (native swings play the clip linearly over the whole attack).
import { createRequire } from "node:module";
import fs from "node:fs";
const req = createRequire("C:/arma-work/tools/gltf/package.json");
const { NodeIO } = req("@gltf-transform/core");
const { ALL_EXTENSIONS } = req("@gltf-transform/extensions");
const { MeshoptDecoder } = req("meshoptimizer");
const [, , glb, contentPath] = process.argv;
const TOTAL = 71; // windupTicks 24 + activeTicks 8 + recoveryTicks 39 of the butcher slash row
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const root = (await io.read(glb)).getRoot();
const clip = root.listAnimations().find((a) => a.getName() === "Attack");
const weapon = root.listNodes().find((n) => n.getName() === "WeaponDrawn");
// the cleaver's extent in the WeaponDrawn frame (the parts carry their own transforms)
const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity], el = [];
for (const part of weapon.listChildren()) {
  if (!part.getMesh()) continue;
  const pm = part.getMatrix(), pos = part.getMesh().listPrimitives()[0].getAttribute("POSITION");
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, el);
    for (let r = 0; r < 3; r++) {
      const v = pm[r] * el[0] + pm[4 + r] * el[1] + pm[8 + r] * el[2] + pm[12 + r];
      low[r] = Math.min(low[r], v);
      high[r] = Math.max(high[r], v);
    }
  }
}
const axis = [0, 1, 2].sort((p, q) => high[q] - low[q] - (high[p] - low[p]))[0], mid = low.map((v, r) => (v + high[r]) / 2);
const ends = [low[axis], high[axis]].map((v) => mid.map((m, r) => (r === axis ? v : m)));
ends.sort((p, q) => Math.hypot(...p) - Math.hypot(...q));
const [BASE, TIP] = ends;
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
  const m = weapon.getWorldMatrix();
  const at = (p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
  frames.push([...at(BASE), ...at(TIP)].map((v) => Number(v.toFixed(4))));
}
const raw = fs.readFileSync(contentPath, "utf8"), crlf = raw.includes("\r\n"), text = raw.replace(/\r\n/g, "\n");
const key = '"boss-butcher-attack": [', start = text.indexOf(key);
const end = text.indexOf("\n      ]", start) + "\n      ]".length;
const pad = (n) => " ".repeat(n);
const body = frames.map((f) => pad(8) + "[\n" + f.map((v) => pad(10) + v).join(",\n") + "\n" + pad(8) + "]").join(",\n");
const out = text.slice(0, start) + key + "\n" + body + "\n" + pad(6) + "]" + text.slice(end);
fs.writeFileSync(contentPath, crlf ? out.replace(/\n/g, "\r\n") : out);
console.log("axis", axis, "base", BASE, "tip", TIP, JSON.stringify([frames[0], frames[36], frames[71]]));
