// Scratch QA driver (not game code): plays each hub NPC's Idle through DonorMotion in headless Chromium, asserts head above hips above feet
// and a moving pose, and takes 375 wide, 3x stills (game camera and a close crop, front and 3/4).
// usage (repo root, Web/node_modules installed): node art/hub-npcs/shoot.mjs <outDir> [refs,comma] [phase]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire("/Users/domininclynch/Developer/frankendom-web/package.json");
const { chromium } = require("playwright");
const repo = new URL("../../", import.meta.url).pathname;
const [, , outDir, refsArg = "npc-marsh,npc-okafor,npc-reyes", phase = "0.3"] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".glb": "model/gltf-binary", ".webp": "image/webp", ".png": "image/png" };
const server = http
  .createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = u === "/" ? path.join(repo, "art/hub-npcs/idle.html") : path.join(repo, u);
    if (!file.startsWith(repo)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(0);
const port = server.address().port;
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
let failed = false;
for (const ref of refsArg.split(",")) {
  for (const [view, close] of [["front", 0], ["q34", 0], ["front", 1], ["q34", 1], ["front", 2]]) {
    const page = await context.newPage();
    page.on("pageerror", (e) => { console.log("pageerror", e.message); failed = true; });
    page.on("console", (m) => m.type() === "error" && console.log("console", m.text()));
    await page.goto(`http://localhost:${port}/?ref=${ref}&view=${view}&close=${close}&phase=${phase}`);
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    await page.waitForTimeout(400); // let the backdrop texture arrive, then repaint
    await page.evaluate(() => window.__ready);
    if (view === "front" && !close) {
      const report = await page.evaluate(() => window.__report);
      const ok = report.clip === "Idle" && report.frames.every((f) => f.head > f.hips + 0.3 && f.hips > f.foot + 0.3);
      const heads = report.frames.map((f) => f.head);
      const moves = Math.max(...heads) - Math.min(...heads) > 0.005 || report.frames.some((f) => Math.abs(f.rHand[1] - report.frames[0].rHand[1]) > 0.01);
      console.log(ref, report.clip, ok ? "upright" : "NOT UPRIGHT", moves ? "pose changes" : "FROZEN", "head range", Math.min(...heads).toFixed(3), Math.max(...heads).toFixed(3));
      if (!ok || !moves) failed = true;
    }
    await page.screenshot({ path: path.join(outDir, `${ref}-idle-${view}${close === 2 ? "-detail" : close ? "-close" : ""}.png`) });
    await page.close();
  }
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
