// Scratch QA driver (not game code): stage the eel on East (animal cycle B) near the player and take 375x812 in-game stills.
// usage: node eel-still.mjs <dist> <label> <outDir>
//   env: PLAYWRIGHT_DIR (dir whose node_modules holds playwright), MODE=idle|walk|bite|hurt|death|all (default all), DIST_AHEAD (metres, default 3.2)
//        OFF=1 loads the page with ?noeel=1 (the off switch) and prints the slot rig instead of taking stills
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.join(process.env.PLAYWRIGHT_DIR ?? "/srv/dev-jobs/bossbody/v3", "package.json"));
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
// GPU=metal on the Mac (headless, muted, Apple GPU); otherwise software GL (the VPS)
const gpu = process.env.GPU === "metal" ? ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", ...gpu] });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DPR ?? 3), hasTouch: true, isMobile: true });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("requestfinished", (r) => { if (/eel/.test(r.url())) console.log("loaded", r.url().split("/").slice(-2).join("/")); });
page.on("requestfailed", (r) => { if (/eel/.test(r.url())) console.log("FAILED", r.url()); });
await page.clock.install({ time: 0 });
await page.clock.pauseAt(1000);
await page.addInitScript(() => {
  let s = 12345;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
});
await page.goto(`http://localhost:${port}/?qa=1&world=0${process.env.OFF ? "&noeel=1" : ""}`);
await page.waitForSelector("#enter");
await page.tap("#enter");
for (let i = 0; i < 4000; i++) {
  if (await page.evaluate(() => !!(window.__qa?.game && window.__qa.state().loaded))) break;
  await page.clock.runFor(16);
  await page.waitForTimeout(10);
}
for (let i = 0; i < 40; i++) { await page.clock.runFor(16); await page.waitForTimeout(100); }
const stepTo = async (target) => {
  for (let i = 0; i < 6000; i++) {
    if ((await page.evaluate(() => window.__qa.game.tick)) >= target) return;
    await page.clock.runFor(16);
  }
  throw Error("tick " + target + " not reached");
};
const tickNow = () => page.evaluate(() => window.__qa.game.tick);
await stepTo(300);
// Scratch QA only: cycle B, the Westminster boss marked defeated so its exits open, then walk to east-bridge by the session's own area switch.
await page.evaluate(() => {
  const q = window.__qa;
  const eq = q.world.bossEquipmentData ?? {};
  const field = Object.keys(eq).find((k) => eq[k].source.placementKey === "boss-witch-v1");
  q.game.bossEquipment ??= {};
  if (field) q.game.bossEquipment[field] = { ...(q.game.bossEquipment[field] ?? {}), status: "owned" };
  q.game.animalCycle = "B";
  window.__travel = q.session.activateArea({ areaId: "east", entryPoint: q.world.manifest.entries.east }).then((ok) => (window.__travelDone = ok));
});
for (let i = 0; i < 6000 && (await page.evaluate(() => window.__travelDone)) === undefined; i++) {
  await page.clock.runFor(16);
  await page.waitForTimeout(10);
}
console.log(label, "travel", await page.evaluate(() => window.__travelDone), await page.evaluate(() => window.__qa.state().area));
console.log(label, "residents", JSON.stringify(await page.evaluate(() => window.__qa.game.enemies.filter((e) => e.kind >= 0).map((e) => [e.placementKey, e.rig, e.animalRecipe, e.hp]))));
if (process.env.OFF) { await browser.close(); server.close(); process.exit(0); }
for (let i = 0; i < 240; i++) { await page.clock.runFor(16); await page.waitForTimeout(80); } // the deferred eel model streams in
console.log(label, "network", JSON.stringify(await page.evaluate(() => performance.getEntriesByType("resource").filter((r) => /eel/.test(r.name)).map((r) => [r.name.split("/").pop(), r.transferSize]))));
console.log(label, "errors", JSON.stringify(await page.evaluate(() => window.__qa.errors)));
const ahead = Number(process.env.DIST_AHEAD ?? 3.2);
// Scratch QA only: every other creature is moved far away so the eel is judged alone; the eel lies across the screen (facing -x), clear of the player.
const stage = (spec) => page.evaluate((s) => {
  const g = window.__qa.game, p = g.player;
  const e = g.enemies.find((x) => x.rig === "giant-eel");
  if (!e) return { error: "no eel", rigs: g.enemies.map((x) => x.rig) };
  for (const o of g.enemies) if (o !== e && o.kind >= 0) { o.pos.x = p.pos.x + 60; o.pos.z = p.pos.z + 60; o.home = { ...o.pos }; o.alerted = false; o.moveSpeed = 0; }
  Object.assign(e, { home: { x: p.pos.x + s.x, z: p.pos.z + s.z }, alerted: !!s.alerted, hp: e.maxHP });
  e.pos.x = p.pos.x + s.x; e.pos.z = p.pos.z + s.z;
  e.patrol = [{ ...e.pos }, { ...e.pos }];
  if (e.facing) { e.facing.x = s.fx; e.facing.z = s.fz; } else e.facing = { x: s.fx, z: s.fz };
  window.__eelId = e.id;
  return { player: { ...p.pos }, eel: { ...e.pos }, hp: e.hp, scale: e.mobSize };
}, spec);
const AT = { idle: { x: 2.6, z: 3.2, fx: -1, fz: 0 }, bite: { x: 1.1, z: 0.7, fx: -1, fz: -0.3, alerted: true } };
const staged = await stage(AT.idle);
console.log(label, "staged", JSON.stringify(staged));
const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${label}-${name}-full.png`), timeout: 120000 });
  console.log(label, name, "shot");
};
const mode = process.env.MODE ?? "all";
await stepTo((await tickNow()) + 60);
if (mode === "all" || mode === "idle") await shot("idle");
if (mode === "all" || mode === "walk") {
  // alerted from 5 m out: it turns and comes along the ground; two frames of the approach
  await stage({ x: 5.0, z: 3.0, fx: -1, fz: -0.4, alerted: true });
  await page.evaluate(() => { const e = window.__qa.game.enemies.find((x) => x.id === window.__eelId); Object.assign(e, { home: null, wokeAt: window.__qa.game.time }); });
  await stepTo((await tickNow()) + 25);
  await shot("alert");
  await stepTo((await tickNow()) + 25);
  await shot("alert2");
}
if (mode === "all" || mode === "bite") {
  await stage(AT.bite);
  await page.evaluate(() => { const e = window.__qa.game.enemies.find((x) => x.id === window.__eelId); Object.assign(e, { home: null, wokeAt: window.__qa.game.time }); });
  for (let k = 0; k < 14; k++) {
    await stepTo((await tickNow()) + 8);
    const s = await page.evaluate(() => { const e = window.__qa.game.enemies.find((x) => x.id === window.__eelId); return { swing: !!e.swing, d: Math.hypot(e.pos.x - window.__qa.game.player.pos.x, e.pos.z - window.__qa.game.player.pos.z) }; });
    if (s.swing) { await shot("bite"); break; }
  }
}
if (mode === "all" || mode === "death") {
  await stage({ ...AT.idle, alerted: false });
  await page.evaluate(() => {
    const g = window.__qa.game, e = g.enemies.find((x) => x.id === window.__eelId);
    e.hp = 0; e.response = { clip: "Death", start: g.time, ticks: 74 };
    g.enemies = g.enemies.filter((x) => x !== e);
    g.corpses = [...(g.corpses ?? []), e];
  });
  await stepTo((await tickNow()) + 40);
  await shot("death");
}
console.log(label, "final errors", JSON.stringify(await page.evaluate(() => window.__qa.errors)));
await browser.close();
server.close();
