// Scratch QA driver (not game code): enter the Central Hub in a built game (dist) and take 375 px stills with the hub NPCs in view.
// usage: node hub-still.mjs <dist> <label> <outDir> [query, e.g. "nonpcs=1"]   (Playwright from a local install, loopback only)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const FRANKENDOM_WEB = process.env.FRANKENDOM_WEB || `${process.env.HOME}/Developer/frankendom-web`; // checkout with node_modules/playwright
const require = createRequire(`${FRANKENDOM_WEB}/package.json`);
const { chromium } = require("playwright");
const [, , dist, label, outDir, extra = ""] = process.argv;
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
page.on("pageerror", (e) => console.log("pageerror", e.message, String(e.stack).split("\n").slice(1, 4).join(" | ")));
page.on("console", (m) => /ARMAGEDOM|error|warn/i.test(m.type() + m.text()) && console.log("console", m.type(), m.text().slice(0, 200)));
await page.clock.install({ time: 0 });
await page.clock.pauseAt(1000);
await page.goto(`http://localhost:${port}/?qa=1&world=0${extra ? "&" + extra : ""}`);
await page.waitForSelector("#enter");
await page.tap("#enter");
const run = async (ms) => {
  for (let t = 0; t < ms; t += 16) { await page.clock.runFor(16); if (t % 160 === 0) await page.waitForTimeout(10); }
};
for (let i = 0; i < 4000; i++) {
  if (await page.evaluate(() => !!(window.__qa?.game && window.__qa.state().loaded)).catch(() => false)) break;
  await run(16);
}
await run(2000);
// The travel waits on animation frames, which the paused clock only gives while it runs: start it, then run the clock.
await page.evaluate(() => {
  // QA only: the hub exit is locked until the Ember Matron is dead; mark her loot owned in this throwaway page so the exit gate opens.
  const g = window.__qa.game, d = g.world.bossEquipmentData ?? {};
  const field = Object.keys(d).find((k) => d[k].source.placementKey === "boss-witch-v1");
  (g.bossEquipment ??= {})[field] = { status: "owned" };
  window.__act = "pending";
  window.__qa.session.activateArea({ areaId: "central-hub", entryPoint: window.__qa.world.manifest.entries["central-hub"] }).then((r) => (window.__act = r), (e) => (window.__act = String(e)));
});
await run(3000);
const ok = await page.evaluate(() => window.__act);
console.log(label, "activate", JSON.stringify(ok), "message", JSON.stringify(await page.evaluate(() => window.__qa.game.message)), "links", JSON.stringify(await page.evaluate(() => window.__qa.game.world.registry.links("westminster"))));
for (let i = 0; i < 100; i++) { await run(160); await page.waitForTimeout(60); }
console.log(label, "state", JSON.stringify(await page.evaluate(() => window.__qa.state())));
console.log(label, "npcs", await page.evaluate(() => { const s = window.__qa.world; let n = null; s?.group?.traverse?.((o) => { if (o.name === "hub-npcs") n = o.children.map((c) => [c.name, +c.position.x.toFixed(2), +c.position.z.toFixed(2)]); }); return JSON.stringify(n); }));
await page.screenshot({ path: path.join(outDir, `${label}.png`) });
await browser.close();
server.close();
