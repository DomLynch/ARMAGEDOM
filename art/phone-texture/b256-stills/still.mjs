// Scratch driver: deterministic fake clock, stage a hollow close to the player, report renderer.info + upload bytes, take full and crop stills.
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
await page.clock.pauseAt(1000); // from here time moves only when runFor says so
await page.addInitScript(() => {
  let s = 12345;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  window.__uploadBytes = 0;
  const storage = WebGL2RenderingContext.prototype.texStorage2D;
  WebGL2RenderingContext.prototype.texStorage2D = function (target, levels, internal, w, h) {
    for (let l = 0; l < levels; l++) window.__uploadBytes += Math.max(1, w >> l) * Math.max(1, h >> l) * 4;
    return storage.apply(this, arguments);
  };
});
await page.goto(`http://localhost:${port}/?qa=1&world=0`);
await page.waitForSelector("#enter");
await page.tap("#enter");
// Loading is network + promises; step the fake clock until the game is up.
for (let i = 0; i < 4000; i++) {
  if (await page.evaluate(() => !!(window.__qa?.game && window.__qa.state().loaded))) break;
  await page.clock.runFor(16);
  await page.waitForTimeout(10);
}
// Let deferred loads settle on real time while the game stands still on the 16 ms frame grid.
for (let i = 0; i < 30; i++) { await page.clock.runFor(16); await page.waitForTimeout(100); }
const memory = await page.evaluate(() => ({ ...window.__renderer.info.memory, uploadMB: +(window.__uploadBytes / 1048576).toFixed(2) }));
console.log(label, "memory", JSON.stringify(memory));
// Everything below is keyed to the game's own tick, not to wall time, so both builds reach the same state.
const stepTo = async (target) => {
  for (let i = 0; i < 3000; i++) {
    if ((await page.evaluate(() => window.__qa.game.tick)) >= target) return;
    await page.clock.runFor(16);
  }
  throw Error("tick " + target + " not reached");
};
await stepTo(800);
await page.getByText("KNIFE", { exact: true }).first().tap();
await stepTo(900);
// Stage: the nearest hollow stands 1.5 m in front of the player, both facing each other.
const staged = await page.evaluate(() => {
  const g = window.__qa.game, p = g.player;
  const h = g.enemies.find((e) => e.rig === "hollow-scavenger");
  const f = p.facing ?? { x: 0, z: 1 };
  const len = Math.hypot(f.x, f.z) || 1;
  const d = { x: f.x / len, z: f.z / len };
  h.pos.x = p.pos.x + d.x * 2; h.pos.z = p.pos.z + d.z * 2;
  if (h.facing) { h.facing.x = -d.x; h.facing.z = -d.z; }
  return { player: { ...p.pos }, facing: d, hollow: { ...h.pos }, id: h.id };
});
console.log(label, "staged", JSON.stringify(staged));
await stepTo(930);
await page.waitForTimeout(300);
const state = await page.evaluate(() => {
  const g = window.__qa.game;
  const h = g.enemies.find((e) => e.rig === "hollow-scavenger");
  return { tick: g.tick, hollow: { ...h.pos }, player: { ...g.player.pos } };
});
console.log(label, "after", JSON.stringify(state));
await page.screenshot({ path: path.join(outDir, `${label}-full.png`) });
await page.screenshot({ path: path.join(outDir, `${label}-crop.png`), clip: { x: 112, y: 470, width: 150, height: 150 } });
const mem2 = await page.evaluate(() => ({ ...window.__renderer.info.memory, uploadMB: +(window.__uploadBytes / 1048576).toFixed(2) }));
console.log(label, "memory after", JSON.stringify(mem2));
await browser.close();
server.close();
