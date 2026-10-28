// Scratch QA driver (not game code): plays each hub NPC's Idle through DonorMotion in headless Chromium, asserts head above hips above feet,
// a moving pose and a closed loop, and takes 375 wide, 3x stills (game camera, close crop and detail, front and 3/4).
// usage (repo root, Web/node_modules installed): node art/hub-npcs/shoot.mjs <outDir> [refs,comma] [phases,comma]
// env: VIEWS="front:0,q34:0,front:1,q34:1,front:2" (view:zoomLevel), CAND_DIR=<dir> and GLB=<file in it> to try a candidate GLB, SUFFIX=<text>.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire("/Users/domininclynch/Developer/frankendom-web/package.json");
const { chromium } = require("playwright");
const repo = new URL("../../", import.meta.url).pathname;
const [, , outDir, refsArg = "npc-marsh,npc-okafor,npc-reyes", phases = "0"] = process.argv;
const views = (process.env.VIEWS ?? "front:0,q34:0,front:1,q34:1,front:2").split(",").map((v) => v.split(":"));
fs.mkdirSync(outDir, { recursive: true });
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".glb": "model/gltf-binary", ".webp": "image/webp", ".png": "image/png" };
const server = http
  .createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = u === "/" ? path.join(repo, "art/hub-npcs/idle.html") : u.startsWith("/cand/") && process.env.CAND_DIR ? path.join(process.env.CAND_DIR, u.slice(6)) : path.join(repo, u);
    if (!file.startsWith(repo) && !(process.env.CAND_DIR && file.startsWith(process.env.CAND_DIR))) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(0);
const port = server.address().port;
const cells = phases.split(",").length;
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] });
const context = await browser.newContext({ viewport: { width: 375 * cells, height: 812 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
let failed = false;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
for (const ref of refsArg.split(",")) {
  let reported = false;
  for (const [view, level] of views) {
    const page = await context.newPage();
    page.on("pageerror", (e) => { console.log("pageerror", e.message); failed = true; });
    page.on("console", (m) => m.type() === "error" && console.log("console", m.text()));
    const glb = process.env.GLB ? `&glb=/cand/${process.env.GLB}` : "";
    await page.goto(`http://localhost:${port}/?ref=${ref}&view=${view}&close=${level}&phases=${phases}${glb}`);
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    await page.waitForTimeout(400);
    if (!reported) {
      reported = true;
      const report = await page.evaluate(() => window.__report);
      const f = report.frames;
      const ok = report.clip === "Idle" && f.every((x) => x.head > x.hips + 0.3 && x.hips > x.foot + 0.3);
      const headRange = Math.max(...f.map((x) => x.head)) - Math.min(...f.map((x) => x.head));
      const hand = Math.max(...f.map((x) => Math.max(dist(x.rHand, f[0].rHand), dist(x.lHand, f[0].lHand))));
      const moves = headRange > 0.005 || hand > 0.01;
      const seam = Math.max(dist(f.at(-1).rHand, f[0].rHand), dist(f.at(-1).lHand, f[0].lHand));
      const low = f.map((x) => x.low);
      console.log(ref, report.clip, `${report.duration.toFixed(1)}s`, ok ? "upright" : "NOT UPRIGHT", moves ? "pose changes" : "FROZEN", `head range ${headRange.toFixed(3)} hand travel ${hand.toFixed(2)} loop seam ${seam.toFixed(2)} lowest vertex ${Math.min(...low).toFixed(3)}..${Math.max(...low).toFixed(3)}`);
      if (!ok || !moves) failed = true;
    }
    const tag = level === "2" ? "-detail" : level === "1" ? "-close" : "";
    await page.screenshot({ path: path.join(outDir, `${ref}-idle-${view}${tag}${process.env.SUFFIX ?? ""}.png`) });
    await page.close();
  }
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
