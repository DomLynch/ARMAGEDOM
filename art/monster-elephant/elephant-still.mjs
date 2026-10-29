// Scratch QA driver (not game code): travel to Elephant and Castle, stage the elephant ahead of the player, and take 375 x 812 stills at the game
// camera with a deterministic fake clock: one while it stands, one mid-approach and one inside its Bite. Runs on the Mac (real GPU, headless,
// muted) against a dist/ built by `vite build` on the VPS.
// usage: node elephant-still.mjs <dist> <label> <outDir>   env: AHEAD=7.5 SIDE=0.6 URLQ=?qa=1&world=0
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
await page.goto(`http://localhost:${port}/${process.env.URLQ ?? "?qa=1&world=0"}`);
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
await page.evaluate(() => {
  const q = window.__qa;
  // Scratch QA only: mark the Westminster boss as defeated so the exit gate opens (never committed to the game).
  const eq = q.world.bossEquipmentData ?? {};
  const field = Object.keys(eq).find((k) => eq[k].source.placementKey === "boss-witch-v1");
  q.game.bossEquipment ??= {};
  if (field) q.game.bossEquipment[field] = { ...(q.game.bossEquipment[field] ?? {}), status: "owned" };
  window.__travel = q.session.activateArea({ areaId: "elephant-and-castle", entryPoint: q.world.manifest.entries["elephant-and-castle"] }).then((ok) => (window.__travelDone = ok));
});
for (let i = 0; i < 4000 && (await page.evaluate(() => window.__travelDone)) === undefined; i++) {
  await page.clock.runFor(16);
  await page.waitForTimeout(10);
}
console.log(label, "travel", await page.evaluate(() => window.__travelDone), await page.evaluate(() => window.__qa.state().area));
console.log(label, "errors", JSON.stringify(await page.evaluate(() => window.__qa.errors)));
for (let i = 0; i < 40; i++) { await page.clock.runFor(16); await page.waitForTimeout(100); }
await stepTo((await page.evaluate(() => window.__qa.game.tick)) + 30);
const ahead = Number(process.env.AHEAD ?? 7.5), side = Number(process.env.SIDE ?? 0.6);
const staged = await page.evaluate(([ahead, side]) => {
  const g = window.__qa.game, p = g.player;
  const e = g.enemies.find((x) => x.rig === "original-elephant");
  if (!e) return { error: "no elephant", rigs: g.enemies.map((x) => x.rig) };
  // The elephant stays on its own patrol; the player is moved to open ground in its line of sight, `ahead` metres below it on screen.
  const w = window.__qa.world;
  let found = null;
  for (const dz of [ahead, ahead + 0.5, ahead - 0.5, ahead + 1, ahead - 1]) {
    for (const dx of [side, -side, side + 1.5, -side - 1.5, 0]) {
      const c = { x: e.pos.x + dx, z: e.pos.z - dz };
      if (w.geometry.clear(c, 0.5) && w.lineClear(e.pos, c)) { found = c; break; }
    }
    if (found) break;
  }
  if (!found) return { error: "no clear spot", pos: { ...e.pos } };
  p.pos.x = found.x;
  p.pos.z = found.z;
  e.alerted = false;
  if (e.facing) { e.facing.x = 0; e.facing.z = -1; }
  if (e.facing) { e.facing.x = 0; e.facing.z = -1; }
  return { player: { ...p.pos }, elephant: { ...e.pos }, id: e.id, hp: e.hp, radius: e.radius, reach: e.contactGoalReach, speed: e.moveSpeed };
}, [ahead, side]);
console.log(label, "staged", JSON.stringify(staged));
if (staged.error) process.exit(1);
await stepTo((await page.evaluate(() => window.__qa.game.tick)) + 20);
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outDir, `${label}-idle.png`) });
// approach until the Bite is in its active window, capturing the approach on the way
let shotApproach = false, shotBite = false;
for (let i = 0; i < 700 && !shotBite; i++) {
  await page.clock.runFor(16);
  const s = await page.evaluate(() => {
    const g = window.__qa.game, e = g.enemies.find((x) => x.rig === "original-elephant");
    return { tick: g.tick, swing: e?.swing ? e.swing.ageTicks : null, d: e ? Math.hypot(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z) : null, hp: g.player.hp, ehp: e?.hp };
  });
  if (!shotApproach && s.d !== null && s.d < staged.reach + 1.5 && s.swing === null) {
    shotApproach = true;
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(outDir, `${label}-approach.png`) });
    console.log(label, "approach", JSON.stringify(s));
  }
  if (s.swing !== null && s.swing >= 22) {
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(outDir, `${label}-bite.png`) });
    shotBite = true;
    console.log(label, "bite", JSON.stringify(s));
  }
}
console.log(label, "enemy", JSON.stringify(await page.evaluate(() => { const e = window.__qa.game.enemies.find((x) => x.rig === "original-elephant"); const o = {}; for (const [k, v] of Object.entries(e)) if (["number", "string", "boolean"].includes(typeof v) || v === null) o[k] = v; return o; })));
console.log(label, "debug", JSON.stringify(await page.evaluate(() => { const g = window.__qa.game, e = g.enemies.find((x) => x.rig === "original-elephant"); return { time: g.time, next: g.nextEnemyAttackAt, intent: e.residentIntent, role: e.animalRole ? { ...e.animalRole, steps: undefined } : null, wake: e.wakeDistance, leash: e.homeLeash, home: e.home, pos: e.pos, player: g.player.pos, finished: g.finished, paused: g.paused, others: g.enemies.map((x) => [x.rig, x.alerted]).slice(0, 12) }; })));
console.log(label, "final", JSON.stringify(await page.evaluate(() => { const g = window.__qa.game; return { hp: g.player.hp, tick: g.tick, errors: window.__qa.errors }; })));
await browser.close();
server.close();
