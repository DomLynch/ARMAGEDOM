// Scratch QA driver (not game code): in-game stills of the Rat King at 375x812, game camera, fake clock, ?qa=1&world=0.
// The dist is a QA copy whose areas.json names area7 as initialArea (never committed), so the king is on screen without playing there.
// usage: node king-still.mjs <dist> <outDir> [query]   env: SEED, CHASE (ticks), OFFSET='{"x":1.6,"z":5.2}'
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire("/root/f3v-load/package.json");
const { chromium } = require("playwright");
const [, , dist, outDir, query = ""] = process.argv;
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
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--mute-audio", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("console.error", m.text().slice(0, 200)); });
await page.clock.install({ time: 0 });
await page.clock.pauseAt(1000);
await page.addInitScript(() => {
  let s = 12345;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
});
await page.goto(`http://localhost:${port}/?qa=1&world=0${query}`);
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
await stepTo(120);
console.log("area", await page.evaluate(() => window.__qa.state().area), "enemies", JSON.stringify(await page.evaluate(() => window.__qa.game.enemies.map((e) => [e.placementKey, e.rig, e.animalRecipe ?? null, e.appearanceRef ?? null, e.hp, e.maxHP, +e.pos.x.toFixed(1), +e.pos.z.toFixed(1)]))));
const off = JSON.parse(process.env.OFFSET ?? '{"x":1.2,"z":5.0}');
const staged = await page.evaluate((off) => {
  const g = window.__qa.game, p = g.player;
  const e = g.enemies.find((x) => x.placementKey === "area7-station-rat-v1");
  if (!e) return { error: "no king" };
  // Keep everyone else away so the still is the king alone; the king holds still and faces the camera.
  for (const x of g.enemies) if (x !== e) { x.pos.x = p.pos.x + 60; x.pos.z = p.pos.z + 60; x.moveSpeed = 0; }
  Object.assign(e, { alerted: false, home: null, moveSpeed: 0 });
  e.pos.x = p.pos.x + off.x; e.pos.z = p.pos.z + off.z;
  const face = { x: 0, z: -1 };
  if (e.facing) { e.facing.x = face.x; e.facing.z = face.z; } else e.facing = { ...face };
  return { player: { ...p.pos }, king: { ...e.pos }, hp: e.hp };
}, off);
console.log("staged", JSON.stringify(staged));
for (let i = 0; i < 200; i++) { await page.clock.runFor(16); await page.waitForTimeout(40); }
console.log("errors", JSON.stringify(await page.evaluate(() => window.__qa.errors)));
await page.screenshot({ path: path.join(outDir, "king-idle-full.png"), timeout: 240000 });
if (process.env.CHASE) {
  await page.evaluate(() => {
    const g = window.__qa.game, p = g.player, e = g.enemies.find((x) => x.placementKey === "area7-station-rat-v1");
    // Mid-fight: the king up close and awake, so the bite and the run clip play at the fight camera.
    e.pos.x = p.pos.x - 0.2; e.pos.z = p.pos.z + 3.0;
    Object.assign(e, { alerted: true, moveSpeed: 2.1, returning: false, ready: 0, wokeAt: 0 });
    p.facing = { x: 0, z: 1 };
  });
  const t0 = await page.evaluate(() => window.__qa.game.tick);
  await stepTo(t0 + Number(process.env.CHASE));
  await page.waitForTimeout(400);
  console.log("chase", JSON.stringify(await page.evaluate(() => { const e = window.__qa.game.enemies.find((x) => x.placementKey === "area7-station-rat-v1"); return [e.pos, e.facing, e.hp]; })));
  await page.screenshot({ path: path.join(outDir, "king-chase-full.png"), timeout: 240000 });
}
await browser.close();
server.close();
