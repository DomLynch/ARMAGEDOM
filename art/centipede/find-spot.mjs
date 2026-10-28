// Scratch: where can a creature of radius R stand and patrol? usage: node find-spot.mjs <area> <radius> [key]
// With a key, print the largest radius at which that resident's start and patrol stay clear (what validateResidentGeometry needs).
import fs from "node:fs";
import { createGeometry } from "../../Web/src/world-geometry.js";
const area = process.argv[2] ?? "area7";
const radius = Number(process.argv[3] ?? 1.7);
const key = process.argv[4];
const layout = JSON.parse(fs.readFileSync(new URL(`../../Web/public/world/${area}/layout.json`, import.meta.url)));
const g = createGeometry(layout);
const content = JSON.parse(fs.readFileSync(new URL("../../Web/public/world/area-content.json", import.meta.url)));
if (key) {
  const row = content.residents[area].find((r) => r.key === key);
  const pts = [row.pos, ...row.patrol];
  const along = [];
  for (let i = 0; i < row.patrol.length; i++) {
    const a = row.patrol[i], b = row.patrol[(i + 1) % row.patrol.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.2));
    for (let n = 0; n <= steps; n++) along.push({ x: a.x + ((b.x - a.x) * n) / steps, z: a.z + ((b.z - a.z) * n) / steps });
  }
  let best = 0;
  for (let r = 0.3; r <= 3; r += 0.05) if (pts.concat(along).every((p) => g.clear(p, r))) best = r;
  console.log(key, "largest clear radius", best.toFixed(2));
} else {
  const out = [];
  for (let x = -20; x <= 24; x += 1)
    for (let z = -12; z <= 30; z += 1)
      if (g.clear({ x, z }, radius) && g.clear({ x, z: z + 1 }, radius) && g.clear({ x, z: z + 0.5 }, radius)) out.push([x, z]);
  console.log("radius", radius, "clear spots", out.length, JSON.stringify(out));
}
for (const r of content.residents[area]) console.log(r.key, r.pos.x, r.pos.z);
