// Crow model viewer stills (Mac, headless, muted). Usage: node viewer.mjs <dir with viewer.html + glb> <glb name> [label]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const FRANKENDOM_WEB = process.env.FRANKENDOM_WEB || `${process.env.HOME}/Developer/frankendom-web`; // checkout with node_modules/playwright and three
const require = createRequire(`${FRANKENDOM_WEB}/package.json`);
const { chromium } = require("playwright");
const S = process.argv[2];
const GLB = process.argv[3];
const LABEL = process.argv[4] ?? "crow";
const OUT = process.argv[5] ?? path.join(S, "stills");
fs.mkdirSync(OUT, { recursive: true });
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
const ctx = await browser.newContext({ viewport: { width: 375, height: 420 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message, e.stack?.split("\n").slice(0, 4).join(" | ")));
page.on("console", (m) => { if (m.type() === "error") console.log("console", m.text()); });
const shots = [["q34", "rat_idle", 0.4], ["side", "rat_idle", 0.4], ["front", "rat_idle", 0.4], ["top", "rat_idle", 0.4], ["q34", "rat_bite", 0.25], ["q34", "rat_run", 0.15], ["q34", "rat_death", 0.8]];
for (const [view, clip, t] of shots) {
  await page.goto(`http://localhost:${port}/?glb=/${GLB}&view=${view}&clip=${clip}&t=${t}`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  console.log(view, clip, JSON.stringify(await page.evaluate(() => [window.__tooth, window.__names])));
  await page.screenshot({ path: path.join(OUT, `viewer-${LABEL}-${view}-${clip}.png`) });
}
await browser.close();
server.close();
