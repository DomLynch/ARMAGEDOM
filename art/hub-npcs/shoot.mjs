// node shoot.mjs <root> <out.png> <w> <h> <glbs,comma> [view] [t] [scale]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire("/Users/domininclynch/Developer/frankendom-web/package.json");
const { chromium } = require("playwright");
const [root, out, w, h, glbs, view = "front", t = "0.5", scale = "1"] = process.argv.slice(2);
const THREE = "/Users/domininclynch/Developer/frankendom-web/node_modules/three";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const f = u.startsWith("/three/") ? path.join(THREE, u.slice(7)) : u === "/" ? path.join(path.dirname(new URL(import.meta.url).pathname), "sheet.html") : path.join(root, u);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] ?? "application/octet-stream" });
    res.end(d);
  });
}).listen(0);
const port = server.address().port;
const n = glbs.split(",").length;
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] });
const ctx = await browser.newContext({ viewport: { width: +w * n, height: +h }, deviceScaleFactor: +scale });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => m.type() === "error" && console.log("console", m.text()));
await page.goto(`http://localhost:${port}/?glbs=${glbs}&w=${w}&h=${h}&view=${view}&t=${t}`);
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
console.log(await page.title());
await page.screenshot({ path: out });
await browser.close();
server.close();
