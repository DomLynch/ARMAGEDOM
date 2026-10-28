// Scratch QA driver (not game code): load a built Web/dist, enter South at a few entry points and take 375x812 stills (crate stack by the Lambeth arrival, hedgehog at the bottom edge).
// usage: node south-still.mjs <dist> <label> <outDir> <playwright-node_modules-parent>   (Playwright fake clock, ?qa=1&world=0, seeded Math.random)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const [, , dist, label, outDir, pwRoot] = process.argv;
const require = createRequire(path.join(pwRoot, "package.json"));
const { chromium } = require("playwright");
fs.mkdirSync(outDir, { recursive: true });
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".glb": "model/gltf-binary", ".webp": "image/webp", ".png": "image/png", ".css": "text/css", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (file.endsWith("/")) file += "index.html";
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
    res.end(data);
  });
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", ...(process.env.SOFTWARE ? ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] : ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"])] });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.clock.install({ time: 0 });
await page.clock.pauseAt(1000);
await page.addInitScript(() => {
  let s = 12345;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
});
await page.goto(`http://localhost:${port}/?qa=1&world=0`);
await page.waitForSelector("#enter");
await page.tap("#enter");
for (let i = 0; i < 4000; i++) {
  if (await page.evaluate(() => !!(window.__qa?.game && window.__qa.state().loaded))) break;
  await page.clock.runFor(16);
  await page.waitForTimeout(10);
}
for (let i = 0; i < 40; i++) { await page.clock.runFor(16); await page.waitForTimeout(50); }
const frames = async (n) => { for (let i = 0; i < n; i++) { await page.clock.runFor(16); await page.waitForTimeout(30); } };
// Enter South the way travel does (load the area, then place the player at the entry point), once per shot.
const shots = [["lambeth-arrival", 0.261, 0.691], ["by-crates", 0.275, 0.745], ["hub-arrival", 0.5, 0.887], ["by-hedgehog", 0.45, 0.84]];
for (const [name, x, y] of shots) {
  const arrival = await page.evaluate(async ([x, y]) => {
    const g = window.__qa.game, w = window.__qa.world;
    const pos = await w.loadArea("south", { x, y });
    g.player.pos = { ...pos };
    g.enemies = [];
    w.update(g.player.pos, 0, innerWidth, innerHeight, true);
    return { area: w.areaId, pos };
  }, [x, y]);
  await frames(100);
  await page.screenshot({ path: path.join(outDir, `${label}-${name}.png`) });
  console.log(label, name, JSON.stringify(arrival));
}
await browser.close();
server.close();
