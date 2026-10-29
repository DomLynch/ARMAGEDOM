// Print the mesh name, vertex count and the two vertex indices at the fang tips of the final (meshopt) GLB, as three.js loads it:
// the manifest `contact.canines` rows. usage: node find_fangs.mjs <dir with viewer.html + glb> <glb>
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const FRANKENDOM_WEB = process.env.FRANKENDOM_WEB || `${process.env.HOME}/Developer/frankendom-web`; // checkout with node_modules/playwright and three
const require = createRequire(`${FRANKENDOM_WEB}/package.json`);
const { chromium } = require("playwright");
const [, , S, GLB] = process.argv;
const THREE = `${FRANKENDOM_WEB}/node_modules/three`;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const f = u.startsWith("/three/") ? path.join(THREE, u.slice(7)) : path.join(S, u === "/" ? "viewer.html" : u);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] ?? "application/octet-stream" });
    res.end(d);
  });
}).listen(0);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`http://localhost:${server.address().port}/?glb=/${GLB}&view=q34&t=0`);
await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
// fang tips authored in build.py (Blender x, y, z) = (+-0.014, -0.24, 0.002); the three.js geometry is in the glTF Y-up frame (x, z, -y)
// The meshopt GLB stores quantised positions, so the real position is the skinned one (what actors.js reads with getVertexPosition),
// taken through the world matrix; the viewer scales the model by 3, divided out here.
const out = await page.evaluate(() => {
  const m = window.__mesh, p = m.geometry.attributes.position, v = new m.position.constructor();
  m.updateWorldMatrix(true, true);
  m.skeleton.update();
  const pick = (t) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < p.count; i++) {
      m.getVertexPosition(i, v);
      v.applyMatrix4(m.matrixWorld).multiplyScalar(1 / 3);
      const d = Math.hypot(v.x - t[0], v.y - t[1], v.z - t[2]);
      if (d < bd) { bd = d; best = i; }
    }
    return { vertex: best, distance: +bd.toFixed(4) };
  };
  return { mesh: m.name, vertices: p.count, canines: [pick([-0.014 * 0.62, 0.002 * 0.62, 0.24 * 0.62]), pick([0.014 * 0.62, 0.002 * 0.62, 0.24 * 0.62])] };
});
console.log(JSON.stringify(out));
await browser.close();
server.close();
