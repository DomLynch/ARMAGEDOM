// node viewer.mjs <dir with viewer.html and the glb> <glb name> <label> [clip] [t]  -> stills/viewer-<label>-<view>.png
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
const ctx = await browser.newContext({ viewport: { width: 375, height: 420 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("console", m.text()); });
const [glb, label, clip = "roach_idle", t = "0.2"] = process.argv.slice(3);
fs.mkdirSync(path.join(S, "stills"), { recursive: true });
for (const view of (process.env.VIEWS ?? "q34,front,top,side").split(",")) {
  await page.goto(`http://localhost:${port}/?glb=/${glb}&view=${view}&clip=${clip}&t=${t}`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await page.screenshot({ path: path.join(S, "stills", `viewer-${label}-${view}.png`) });
  console.log(label, view, JSON.stringify(await page.evaluate(() => window.__info.box.map((n) => +n.toFixed(2)))));
  if (view === "q34") console.log("tips", JSON.stringify(await page.evaluate(() => window.__tips)));
}
await browser.close();
server.close();
