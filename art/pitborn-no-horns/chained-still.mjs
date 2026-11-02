// Scratch QA driver (not game code): teleport the player near the chained Pitborn prop in Westminster and take 375 px stills.
// usage: node chained-still.mjs <dist> <label> <outDir>   env: DX, DZ (player offset in metres from the prop, default 0 / -6), CLIP='{"x":..}'
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const FRANKENDOM_WEB = process.env.FRANKENDOM_WEB || `${process.env.HOME}/Developer/frankendom-web`; // checkout with node_modules/playwright
const require = createRequire(`${FRANKENDOM_WEB}/package.json`);
const { chromium } = require("playwright");
const [, , dist, label, outDir] = process.argv;
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
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
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
for (let i = 0; i < 40; i++) { await page.clock.runFor(16); await page.waitForTimeout(100); }
const stepTo = async (target) => {
  for (let i = 0; i < 3000; i++) {
    if ((await page.evaluate(() => window.__qa.game.tick)) >= target) return;
    await page.clock.runFor(16);
  }
  throw Error("tick " + target + " not reached");
};
await stepTo(200);
const at = JSON.parse(fs.readFileSync(path.join(dist, "../chainedAt.json"), "utf8"));
const info = await page.evaluate(({ at, dx, dz }) => {
  const g = window.__qa.game, w = window.__qa.world;
  const ground = w.geometry.ground(at);
  g.player.pos.x = ground.x + dx; g.player.pos.z = ground.z + dz;
  // clear the neighbourhood so no hostile walks into the frame
  for (const e of g.enemies) if (Math.hypot(e.pos.x - ground.x, e.pos.z - ground.z) < 14) { e.pos.x += 30; e.moveSpeed = 0; }
  return { ground: { x: ground.x, z: ground.z }, player: { x: g.player.pos.x, z: g.player.pos.z } };
}, { at, dx: Number(process.env.DX ?? 0), dz: Number(process.env.DZ ?? -6) });
console.log(label, "staged", JSON.stringify(info));
for (let i = 0; i < 200; i++) { await page.clock.runFor(16); await page.waitForTimeout(40); }
console.log(label, "errors", JSON.stringify(await page.evaluate(() => window.__qa.errors)));
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, `${label}-full.png`) });
await page.screenshot({ path: path.join(outDir, `${label}-crop.png`), clip: process.env.CLIP ? JSON.parse(process.env.CLIP) : { x: 60, y: 250, width: 255, height: 320 } });
console.log(label, "shot");
await browser.close();
server.close();
