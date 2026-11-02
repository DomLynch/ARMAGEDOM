// Scratch driver: deterministic fake clock, stage the Westminster roach 2 m ahead of the player, 375 px wide stills.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const FRANKENDOM_WEB = process.env.FRANKENDOM_WEB || `${process.env.HOME}/Developer/frankendom-web`; // checkout with node_modules/playwright
const require = createRequire(`${FRANKENDOM_WEB}/package.json`);
const { chromium } = require("playwright");

const [, , dist, label, outDir, distance = "2"] = process.argv;
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
await page.addInitScript((r) => { window.__rig = r; }, process.env.RIG ?? "original-roach");
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
await stepTo(800);
const area = process.env.ROACH_AREA ?? "area8";
await page.evaluate((a) => {
  const q = window.__qa;
  // Scratch QA only: mark the Westminster boss as defeated so the exit gate opens (never committed to the game).
  const eq = q.world.bossEquipmentData ?? {};
  const field = Object.keys(eq).find((k) => eq[k].source.placementKey === "boss-witch-v1");
  q.game.bossEquipment ??= {};
  if (field) q.game.bossEquipment[field] = { ...(q.game.bossEquipment[field] ?? {}), status: "owned" };
  window.__travel = q.session.activateArea({ areaId: a, entryPoint: q.world.manifest.entries[a] }).then((ok) => (window.__travelDone = ok));
}, area);
for (let i = 0; i < 4000 && (await page.evaluate(() => window.__travelDone)) === undefined; i++) {
  await page.clock.runFor(16);
  await page.waitForTimeout(10);
}
console.log(label, "travel", await page.evaluate(() => window.__travelDone), await page.evaluate(() => window.__qa.state().area));
console.log(label, "errors", JSON.stringify(await page.evaluate(() => window.__qa.errors)));
console.log(label, "gate", JSON.stringify(await page.evaluate(() => { const w = window.__qa.world, g = window.__qa.game; return { links: w.registry?.links?.(w.areaId)?.map((l) => [l.to, l.requiresDefeat, l.requiresVisited]), hp: g.player.hp, finished: g.finished, runSaveInvalid: g.runSaveInvalid }; })));
for (let i = 0; i < 40; i++) { await page.clock.runFor(16); await page.waitForTimeout(100); }
await stepTo((await page.evaluate(() => window.__qa.game.tick)) + 30);
const staged = await page.evaluate((dist) => {
  const g = window.__qa.game, p = g.player;
  const r = g.enemies.find((e) => e.rig === (window.__rig ?? "original-roach"));
  if (!r) return { error: "no roach", rigs: g.enemies.map((e) => e.rig) };
  const f = p.facing ?? { x: 0, z: 1 };
  const len = Math.hypot(f.x, f.z) || 1;
  const d = { x: f.x / len, z: f.z / len };
  Object.assign(r, { home: null, alerted: false });
  r.pos.x = p.pos.x + 0.6; r.pos.z = p.pos.z + 3.6; // screen-up is +z in this camera: open street above the player
  if (r.facing) { r.facing.x = -d.x; r.facing.z = -d.z; }
  return { player: { ...p.pos }, roach: { ...r.pos }, id: r.id };
}, distance);
console.log(label, "staged", JSON.stringify(staged));
await stepTo((await page.evaluate(() => window.__qa.game.tick)) + 40);
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, `${label}-full.png`) });
await page.screenshot({ path: path.join(outDir, `${label}-crop.png`), clip: process.env.CLIP ? JSON.parse(process.env.CLIP) : { x: 150, y: 540, width: 225, height: 200 } });
console.log(label, "shot");
await browser.close();
server.close();
