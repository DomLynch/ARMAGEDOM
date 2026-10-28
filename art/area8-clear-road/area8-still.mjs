// Scratch QA driver (not game code): load a built Web/dist, arrive in Area 8 and take 375x812 stills at the arrival point and a few steps on.
// usage: node area8-still.mjs <dist> <label> <outDir> <playwright-node_modules-parent>   (Playwright fake clock, ?qa=1&world=0, seeded Math.random)
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
// Arrive in Area 8 the way travel does: load the area (backdrop + layout), then place the player at its entry point.
const arrival = await page.evaluate(async () => {
  const g = window.__qa.game, w = window.__qa.world;
  const entry = { x: 0.2092118, y: 0.88603067 };
  const pos = await w.loadArea("area8", entry);
  g.player.pos = { ...pos };
  g.enemies = [];
  w.update(g.player.pos, 0, innerWidth, innerHeight, true);
  return { area: w.areaId, pos };
});
console.log(label, "arrived", JSON.stringify(arrival));
const frames = async (n) => { for (let i = 0; i < n; i++) { await page.clock.runFor(16); await page.waitForTimeout(30); } };
await frames(120);
await page.screenshot({ path: path.join(outDir, `${label}-arrival.png`) });
// A few metres up the road toward the old pile: move the player, let the camera follow, shoot again.
for (const [name, dx, dz] of [["near", 2.5, -1.5], ["beside", 5, -3]]) {
  await page.evaluate(([dx, dz, base]) => {
    const g = window.__qa.game, w = window.__qa.world;
    g.player.pos = { x: base.x + dx, z: base.z + dz };
    w.update(g.player.pos, 0, innerWidth, innerHeight, true);
  }, [dx, dz, arrival.pos]);
  await frames(90);
  await page.screenshot({ path: path.join(outDir, `${label}-${name}.png`) });
  console.log(label, name, JSON.stringify(await page.evaluate(() => window.__qa.state())));
}
await browser.close();
server.close();
