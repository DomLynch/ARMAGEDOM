// usage: node bench.mjs <dir with bench.html + glbs> <glb name> [clip] [instances]  (CPU only: mixer + skeleton update, no GPU draw)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire("/Users/domininclynch/Developer/frankendom-web/package.json");
const { chromium } = require("playwright");
const [, , S, glb, clip = "Run", n = "24", bone = ""] = process.argv;
const PAGE = process.env.PAGE ?? "bench.html"; // PAGE=impact.html also takes the bone name as the 5th argument
const THREE = "/Users/domininclynch/Developer/frankendom-web/node_modules/three";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const f = u.startsWith("/three/") ? path.join(THREE, u.slice(7)) : path.join(S, u === "/" ? PAGE : u);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] ?? "application/octet-stream" });
    res.end(d);
  });
}).listen(0);
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const page = await (await browser.newContext()).newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(`http://localhost:${server.address().port}/?glb=/${glb}&clip=${clip}&n=${n}&bone=${encodeURIComponent(bone)}`);
await page.waitForFunction(() => window.__result, null, { timeout: 120000 });
console.log(JSON.stringify(await page.evaluate(() => window.__result)));
await browser.close();
server.close();
