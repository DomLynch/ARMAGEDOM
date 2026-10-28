// Scratch QA driver (not game code): deterministic fake clock, travel to Area 7, stage the centipede near the player, 375 px stills.
// usage: node still-driver.mjs <dist> <label> <outDir>
// env: RIG (default giant-centipede), AREA (default area7), DX/DZ (offset from the player), FACE ('{"x":0,"z":-1}'), MOVE=attack|walk|idle,
//      HP0=1 to kill it and shoot the death, CLIP='{"x":..,"y":..,"width":..,"height":..}' for the crop, URLQ extra query (nocentipede=1)
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
page.on("console", (m) => { if (["error", "warning"].includes(m.type())) console.log("console", m.type(), m.text().slice(0, 300)); });
await page.clock.install({ time: 0 });
await page.clock.pauseAt(1000);
await page.addInitScript(() => {
  let s = 12345;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
});
await page.addInitScript((r) => { window.__rig = r; }, process.env.RIG ?? "giant-centipede");
await page.goto(`http://localhost:${port}/?qa=1&world=0${process.env.URLQ ? "&" + process.env.URLQ : ""}`);
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
const area = process.env.AREA ?? "area7";
await page.evaluate(([a, cycle]) => {
  const q = window.__qa;
  q.game.animalCycle = cycle; // the centipede is the cycle B creature of Area 7; a fresh area reads the cycle when it builds its residents
  // Scratch QA only: mark the Westminster boss as defeated so the exit gate opens (never committed to the game).
  const eq = q.world.bossEquipmentData ?? {};
  const field = Object.keys(eq).find((k) => eq[k].source.placementKey === "boss-witch-v1");
  q.game.bossEquipment ??= {};
  if (field) q.game.bossEquipment[field] = { ...(q.game.bossEquipment[field] ?? {}), status: "owned" };
  window.__travel = q.session.activateArea({ areaId: a, entryPoint: q.world.manifest.entries[a] }).then((ok) => (window.__travelDone = ok));
}, [area, process.env.CYCLE ?? "B"]);
for (let i = 0; i < 4000 && (await page.evaluate(() => window.__travelDone)) === undefined; i++) {
  await page.clock.runFor(16);
  await page.waitForTimeout(10);
}
console.log(label, "travel", await page.evaluate(() => window.__travelDone), await page.evaluate(() => window.__qa.state().area));
console.log(label, "errors", JSON.stringify(await page.evaluate(() => window.__qa.errors)));
console.log(label, "enemies", JSON.stringify(await page.evaluate(() => window.__qa.game.enemies.map((e) => [e.placementKey, e.rig, e.hp]))));
for (let i = 0; i < 40; i++) { await page.clock.runFor(16); await page.waitForTimeout(100); }
await stepTo((await page.evaluate(() => window.__qa.game.tick)) + 30);
const staged = await page.evaluate(({ dx, dz }) => {
  const g = window.__qa.game, p = g.player;
  const r = g.enemies.find((e) => e.rig === window.__rig);
  if (!r) return { error: "no such creature", rigs: g.enemies.map((e) => e.rig) };
  Object.assign(r, { home: null, alerted: false });
  r.pos.x = p.pos.x + dx; r.pos.z = p.pos.z + dz; // screen-up is +z in this camera
  const face = JSON.parse(window.__face ?? '{"x":0,"z":-1}');
  if (r.facing) { r.facing.x = face.x; r.facing.z = face.z; }
  return { player: { ...p.pos }, creature: { ...r.pos }, id: r.id, radius: r.radius, hp: r.hp };
}, { dx: Number(process.env.DX ?? 0.4), dz: Number(process.env.DZ ?? 4.4) });
console.log(label, "staged", JSON.stringify(staged));
if (staged.error) { await browser.close(); server.close(); process.exit(1); }
const crop = process.env.CLIP ? JSON.parse(process.env.CLIP) : { x: 60, y: 330, width: 315, height: 330 };
const shoot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${label}-${name}-crop.png`), clip: crop });
};
await stepTo((await page.evaluate(() => window.__qa.game.tick)) + 40);
await shoot("idle");
if (process.env.MOVE === "walk" || process.env.MOVE === "attack") {
  // Let it come for the player (alerted): the walk toward the camera, then the bite.
  await page.evaluate(() => {
    const g = window.__qa.game, r = g.enemies.find((e) => e.rig === window.__rig);
    Object.assign(r, { alerted: true, returning: false });
  });
  for (const t of [30, 40, 40]) {
    await stepTo((await page.evaluate(() => window.__qa.game.tick)) + t);
    await shoot(`chase${t}-${await page.evaluate(() => window.__qa.game.tick)}`);
  }
  console.log(label, "after chase", JSON.stringify(await page.evaluate(() => { const g = window.__qa.game, r = g.enemies.find((e) => e.rig === window.__rig); return [r.pos, r.hp, g.player.hp, r.swing?.clip ?? null]; })));
}
if (process.env.HP0) {
  await page.evaluate(() => {
    const g = window.__qa.game, r = g.enemies.find((e) => e.rig === window.__rig);
    r.hp = 0; r.response = { clip: "roach_death", start: g.time, ticks: 48 };
    g.enemies = g.enemies.filter((x) => x !== r);
    g.corpses = [...(g.corpses ?? []), r];
  });
  for (const t of [30, 60, 60]) {
    await stepTo((await page.evaluate(() => window.__qa.game.tick)) + t);
    await shoot(`death${t}`);
  }
}
console.log(label, "errors", JSON.stringify(await page.evaluate(() => window.__qa.errors)));
await browser.close();
server.close();
