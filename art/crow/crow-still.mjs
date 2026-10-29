// Scratch QA driver (not game code): 375 x 812 in-game stills of the crow at the game camera, Mac GPU, headless, muted.
// The crow lives in cycle B of east-bridge and lambeth, which a still driver cannot reach without the runner's travel hook, so this
// driver swaps the Westminster creature slot to the crow in the page's own copy of area-content.json (and re-pins that file in the
// manifest copy the page reads), then stages the crow 3.6 m from the player. Nothing on disk changes.
// usage: node crow-still.mjs <dist> <label> <outDir>   env: RECIPE=crow-carrion|crow-ragged, MOVE=idle|bite|run|death, FACE='{"x":0,"z":-1}'
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const FRANKENDOM_WEB = process.env.FRANKENDOM_WEB || `${process.env.HOME}/Developer/frankendom-web`; // checkout with node_modules/playwright
const require = createRequire(`${FRANKENDOM_WEB}/package.json`);
const { chromium } = require("playwright");
const [, , dist, label, outDir] = process.argv;
const RECIPE = process.env.RECIPE ?? "crow-carrion";
const MOVE = process.env.MOVE ?? "idle";
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
const contentPath = path.join(dist, "world/area-content.json");
const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
const spec = { foundationRef: "original-crow", recipeRef: RECIPE };
content.population.areas.westminster.creatureSlot.cycles = { A: spec, B: spec };
const contentBody = Buffer.from(JSON.stringify(content, null, 2) + "\n");
const manifest = JSON.parse(fs.readFileSync(path.join(dist, "world/manifest.json"), "utf8"));
const row = manifest.files.find((r) => r.path === "area-content.json");
row.bytes = contentBody.length;
row.sha256 = crypto.createHash("sha256").update(contentBody).digest("hex");
const manifestBody = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.route("**/world/area-content.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: contentBody }));
await page.route("**/world/manifest.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: manifestBody }));
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
await stepTo(300);
console.log(label, "enemies", JSON.stringify(await page.evaluate(() => window.__qa.game.enemies.map((e) => [e.rig, e.animalRecipe, +e.pos.x.toFixed(1), +e.pos.z.toFixed(1), e.hp]).slice(0, 10))), "errors", JSON.stringify(await page.evaluate(() => window.__qa.errors)));
const staged = await page.evaluate(({ face, move }) => {
  const g = window.__qa.game, p = g.player;
  const e = g.enemies.find((x) => x.rig === "original-crow");
  if (!e) return { error: "no crow" };
  Object.assign(e, { alerted: move === "bite", home: move === "bite" ? e.home : null, moveSpeed: move === "idle" ? 0 : e.moveSpeed });
  const f = JSON.parse(face);
  if (e.facing) { e.facing.x = f.x; e.facing.z = f.z; } else e.facing = { ...f };
  e.pos.x = p.pos.x + (move === "bite" ? 0.9 : 1.6); e.pos.z = p.pos.z + (move === "bite" ? 2.4 : 5.2);
  return { id: e.id, player: { ...p.pos }, crow: { ...e.pos }, rig: e.rig, recipe: e.animalRecipe, hp: e.hp };
}, { face: process.env.FACE ?? '{"x":0,"z":-1}', move: MOVE });
console.log(label, "staged", JSON.stringify(staged));
for (let i = 0; i < 200; i++) { await page.clock.runFor(16); await page.waitForTimeout(40); } // the deferred crow model streams in meanwhile
if (MOVE !== "bite") {
  // pin it where the camera sees it clearly: it wanders toward the player while the model streams in
  await page.evaluate(() => {
    const g = window.__qa.game, p = g.player, e = g.enemies.find((x) => x.rig === "original-crow");
    e.pos.x = p.pos.x + 1.8; e.pos.z = p.pos.z + 4.2; e.moveSpeed = 0; e.alerted = false;
  });
  await stepTo((await page.evaluate(() => window.__qa.game.tick)) + 2);
}
const clip = process.env.CLIP ? JSON.parse(process.env.CLIP) : { x: 100, y: 300, width: 260, height: 300 };
const shoot = async (name) => {
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, `${label}-${name}-full.png`) });
  await page.screenshot({ path: path.join(outDir, `${label}-${name}-crop.png`), clip });
  console.log(label, name, "shot", JSON.stringify(await page.evaluate(() => { const e = window.__qa.game.enemies.find((x) => x.rig === "original-crow"); return e ? [e.pos, e.hp, e.alerted, e.response ?? null] : null; })));
};
if (MOVE === "death") {
  await page.evaluate(() => {
    const g = window.__qa.game, e = g.enemies.find((x) => x.rig === "original-crow");
    e.hp = 0; e.response = { clip: "rat_death", start: g.time, ticks: 54 };
    g.enemies = g.enemies.filter((x) => x !== e);
    g.corpses = [...(g.corpses ?? []), e];
  });
  const t0 = await page.evaluate(() => window.__qa.game.tick);
  for (const [n, ticks] of [["d10", 20], ["d30", 50]]) { await stepTo(t0 + ticks); await shoot(n); }
} else {
  if (MOVE === "bite") await stepTo((await page.evaluate(() => window.__qa.game.tick)) + 20);
  await shoot(MOVE);
  if (MOVE === "bite") { await stepTo((await page.evaluate(() => window.__qa.game.tick)) + 14); await shoot("bite2"); }
}
console.log(label, "errors", JSON.stringify(await page.evaluate(() => window.__qa.errors)));
await browser.close();
server.close();
