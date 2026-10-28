// Model-only stills of the spider GLB at phone width. usage: node viewer.mjs <dir with viewer.html + glb> <glb> <label> [views] [clip] [t]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire("/Users/domininclynch/Developer/frankendom-web/package.json");
const { chromium } = require("playwright");
const S = process.argv[2];
const GLB = process.argv[3];
const LABEL = process.argv[4] ?? "spider";
const VIEWS = (process.argv[5] ?? "q34,front,top,game,side").split(",");
const CLIP = process.argv[6] ?? "roach_idle";
const T = process.argv[7] ?? "0.4";
const THREE = "/Users/domininclynch/Developer/frankendom-web/node_modules/three";
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
const port = server.address().port;
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] });
const ctx = await browser.newContext({ viewport: { width: 375, height: 420 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
fs.mkdirSync(path.join(S, "stills"), { recursive: true });
for (const view of VIEWS) {
  await page.goto(`http://localhost:${port}/?glb=/${GLB}&view=${view}&clip=${CLIP}&t=${T}`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await page.screenshot({ path: path.join(S, "stills", `viewer-${LABEL}-${view}.png`) });
  console.log(LABEL, view);
}
await browser.close();
server.close();
