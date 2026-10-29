import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const FRANKENDOM_WEB = process.env.FRANKENDOM_WEB || `${process.env.HOME}/Developer/frankendom-web`; // checkout with node_modules/playwright and three
const require = createRequire(`${FRANKENDOM_WEB}/package.json`);
const { chromium } = require("playwright");
const S = process.argv[2];
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
const port = server.address().port;
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] });
const ctx = await browser.newContext({ viewport: { width: 375, height: 420 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
for (const [label, glb] of (process.argv[3] ? [["v3", process.argv[3]]] : [["before", "original-roach.glb"], ["after", "roach-wet.glb"]]))
  for (const view of ["q34", "front", "top"]) {
    await page.goto(`http://localhost:${port}/?glb=/${glb}&view=${view}`);
    await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
    await page.screenshot({ path: path.join(S, "stills", `viewer-${label}-${view}.png`) });
    console.log(label, view);
  }
await browser.close();
server.close();
