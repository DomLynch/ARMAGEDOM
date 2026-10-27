// Scratch QA driver (not game code): stage the marked hunter 3.6 m ahead of the player in Westminster and take 375 px stills.
// usage: node hunter-still.mjs <dist> <label> <outDir>   env: MOVE=attack|walk|idle (default idle), CLIP='{"x":..}'
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
await page.addInitScript((f) => { window.__face = f; }, process.env.FACE ?? '{"x":0,"z":-1}');
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
await stepTo(300);
console.log(label, "enemies", JSON.stringify(await page.evaluate(() => window.__qa.game.enemies.map((e) => [e.rig, e.kind, +e.pos.x.toFixed(1), +e.pos.z.toFixed(1), e.hp]).slice(0, 8))), "marked", JSON.stringify(await page.evaluate(() => window.__qa.game.marked ?? null)));
// Make the nearest enemy a marked hunter (same flags combat.js markedHunter() sets) and ask for the deferred model, as holding marked money does.
const staged = await page.evaluate(() => {
  const g = window.__qa.game, p = g.player;
  const e = g.enemies.filter((x) => x.kind >= 0).sort((a, b) => Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) - Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z))[0];
  if (!e) return { error: "no enemy" };
  Object.assign(e, { markedHunter: true, rig: "hollow-scavenger", alerted: false, home: null, hp: 120, maxHP: 120, moveSpeed: 0 });
  const face = JSON.parse(window.__face ?? '{"x":0,"z":-1}'); // default: toward the player and the camera
  if (e.facing) { e.facing.x = face.x; e.facing.z = face.z; } else e.facing = { ...face };
  g.marked ??= {};
  g.marked.carried = 10;
  e.pos.x = p.pos.x + 1.6; e.pos.z = p.pos.z + 5.2; // up and to the right, clear of the player and the touch controls
  return { id: e.id, player: { ...p.pos }, hunter: { ...e.pos } };
});
console.log(label, "staged", JSON.stringify(staged));
for (let i = 0; i < 240; i++) { await page.clock.runFor(16); await page.waitForTimeout(60); } // the deferred hunter model streams in meanwhile
if (process.env.CHASE) {
  // Let it come for the player: a chasing hunter faces the player, which is the view the game really shows of it.
  await page.evaluate((steps) => {
    const g = window.__qa.game, p = g.player, e = g.enemies.find((x) => x.markedHunter);
    e.pos.x = p.pos.x + 0.8; e.pos.z = p.pos.z + 7.5;
    Object.assign(e, { alerted: true, moveSpeed: 2.0, returning: false });
    window.__chaseSteps = steps;
  }, Number(process.env.CHASE));
  const t0 = await page.evaluate(() => window.__qa.game.tick);
  await stepTo(t0 + Number(process.env.CHASE));
  console.log(label, "chase pos", JSON.stringify(await page.evaluate(() => { const e = window.__qa.game.enemies.find((x) => x.markedHunter); return [e.pos, e.facing, e.hp]; })));
}
if (process.env.DEATH) {
  // Kill it the way combat.js does (hp 0, rigResponse death row of 144 ticks, into corpses) and look at 1.5 s and 3.0 s.
  await page.evaluate(() => {
    const g = window.__qa.game, e = g.enemies.find((x) => x.markedHunter);
    e.hp = 0; e.response = { clip: "Death", start: g.time, ticks: 144 };
    g.enemies = g.enemies.filter((x) => x !== e);
    g.corpses = [...(g.corpses ?? []), e];
  });
  const t0 = await page.evaluate(() => window.__qa.game.tick);
  for (const [label2, ticks] of [["d15", 90], ["d30", 180], ["d50", 300]]) {
    await stepTo(t0 + ticks);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, `${label}-${label2}-crop.png`), clip: process.env.CLIP ? JSON.parse(process.env.CLIP) : { x: 90, y: 300, width: 285, height: 360 } });
    console.log(label, label2, "shot");
  }
  await browser.close(); server.close();
  process.exit(0);
}
const name = await page.evaluate(() => window.__qa.game.enemies.find((e) => e.markedHunter)?.id);
console.log(label, "hunter id", name, "errors", JSON.stringify(await page.evaluate(() => window.__qa.errors)));
await stepTo((await page.evaluate(() => window.__qa.game.tick)) + 60);
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, `${label}-full.png`) });
await page.screenshot({ path: path.join(outDir, `${label}-crop.png`), clip: process.env.CLIP ? JSON.parse(process.env.CLIP) : { x: 90, y: 470, width: 200, height: 250 } });
console.log(label, "shot");
await browser.close();
server.close();
