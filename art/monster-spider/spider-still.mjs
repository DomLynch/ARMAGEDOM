// Scratch QA driver (not game code): load the game with the fake clock at 375x812, switch to animal cycle B, cross into area7 (the station,
// where cycle B puts the spider), stand the spider a few metres from the player and take stills at the game camera.
// usage: node spider-still.mjs <dist> <label> <outDir>   env: MODE=idle|chase|bite|death (default idle), OFF=1 loads ?nospider=1 (expects the dog)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire("/Users/domininclynch/Developer/frankendom-web/package.json");
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
await page.goto(`http://localhost:${port}/?qa=1&world=0${process.env.OFF ? "&nospider=1" : ""}`);
await page.waitForSelector("#enter");
await page.tap("#enter");
const run = async (n, ms = 10) => { for (let i = 0; i < n; i++) { await page.clock.runFor(16); await page.waitForTimeout(ms); } };
for (let i = 0; i < 4000; i++) {
  if (await page.evaluate(() => !!(window.__qa?.game && window.__qa.state().loaded))) break;
  await run(1);
}
await run(40, 100);
const stepTo = async (target) => {
  for (let i = 0; i < 3000; i++) {
    if ((await page.evaluate(() => window.__qa.game.tick)) >= target) return;
    await page.clock.runFor(16);
  }
  throw Error("tick " + target + " not reached");
};
await stepTo(120);
// Cycle B, then the station. The destination model streams in during the crossing.
await page.evaluate(() => { window.__qa.game.animalCycle = "B"; });
// Do not await the crossing inside the page: it needs the fake clock to advance, which only this driver does.
await page.evaluate(() => { window.__crossing = window.__qa.session.activateArea({ areaId: "area7" }).then((v) => (window.__crossed = v)); });
for (let i = 0; i < 1500; i++) { if ((await page.evaluate(() => window.__crossed)) !== undefined) break; await run(1, 20); }
console.log(label, "activate", await page.evaluate(() => window.__crossed));
for (let i = 0; i < 400; i++) { if ((await page.evaluate(() => window.__qa.world.areaId)) === "area7") break; await run(1, 20); }
await run(120, 40);
console.log(label, "area", await page.evaluate(() => window.__qa.world.areaId), "cycle", await page.evaluate(() => window.__qa.game.animalCycle));
await page.evaluate((o) => { Object.assign(window, o); }, { __px: process.env.PX === undefined ? undefined : Number(process.env.PX), __pz: Number(process.env.PZ ?? 0), __ox: Number(process.env.OX ?? -0.6), __oz: Number(process.env.OZ ?? 3.6) });
const staged = await page.evaluate(() => {
  const g = window.__qa.game, p = g.player;
  const list = g.enemies.map((e) => [e.rig, e.placementKey, +e.pos.x.toFixed(1), +e.pos.z.toFixed(1)]);
  const e = g.enemies.find((x) => x.placementKey === "area7-station-rat-v1");
  if (!e) return { error: "no slot enemy", list };
  Object.assign(e, { alerted: false, home: null, hp: 360, maxHP: 360, moveSpeed: 0 });
  if (e.facing) { e.facing.x = 0; e.facing.z = -1; } else e.facing = { x: 0, z: -1 };
  if (window.__px !== undefined) { p.pos.x = window.__px; p.pos.z = window.__pz; } // env PX, PZ: stand the player on open road
  e.pos.x = p.pos.x + window.__ox; e.pos.z = p.pos.z + window.__oz; // env OX, OZ: where the spider stands relative to the player
  return { rig: e.rig, recipe: e.animalRecipe, player: { ...p.pos }, spider: { ...e.pos }, list };
});
console.log(label, "staged", JSON.stringify(staged));
await run(160, 40);
const mode = process.env.MODE ?? "idle";
if (mode === "chase" || mode === "bite") {
  await page.evaluate(() => {
    const g = window.__qa.game, p = g.player, e = g.enemies.find((x) => x.placementKey === "area7-station-rat-v1");
    Object.assign(e, { alerted: true, moveSpeed: 2, returning: false });
  });
  const t0 = await page.evaluate(() => window.__qa.game.tick);
  await stepTo(t0 + (mode === "bite" ? 150 : Number(process.env.STEPS ?? 50)));
}
if (mode === "death") {
  await page.evaluate(() => {
    const g = window.__qa.game, e = g.enemies.find((x) => x.placementKey === "area7-station-rat-v1");
    e.hp = 0; e.response = { clip: "roach_death", start: g.time, ticks: 48 };
  });
  const t0 = await page.evaluate(() => window.__qa.game.tick);
  await stepTo(t0 + 40);
}
console.log(label, "errors", JSON.stringify(await page.evaluate(() => window.__qa.errors)));
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outDir, `${label}-${mode}-full.png`) });
const where = await page.evaluate(() => { const e = window.__qa.game.enemies.find((x) => x.placementKey === "area7-station-rat-v1"); return e ? { x: e.pos.x, z: e.pos.z, rig: e.rig } : null; });
console.log(label, "enemy", JSON.stringify(where));
await browser.close();
server.close();
