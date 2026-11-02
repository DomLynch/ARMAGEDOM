// Scratch QA driver (not game code): open the Vite dev server of this checkout, enter Westminster at a few points around the lion plinth stairs and take 375x812 stills.
// usage: node westminster-still.mjs <baseUrl> <label> <outDir> <playwright-node_modules-parent> [original]
// With "original" the old backdrop and layout (art/westminster-clear-sandbags/original) are served in place of the new ones (the "before" shots).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const [, , baseUrl, label, outDir, pwRoot, original] = process.argv;
const require = createRequire(path.join(pwRoot, "package.json"));
const { chromium } = require("playwright");
const here = path.dirname(new URL(import.meta.url).pathname);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--mute-audio", "--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
if (original) {
  await page.route("**/world/westminster/backdrop-phone.webp*", (r) => r.fulfill({ body: fs.readFileSync(path.join(here, "original/backdrop-phone.webp")), contentType: "image/webp" }));
  await page.route("**/world/westminster/layout.json*", (r) => r.fulfill({ body: fs.readFileSync(path.join(here, "original/layout.json")), contentType: "application/json" }));
}
await page.clock.install({ time: 0 });
await page.clock.pauseAt(1000);
await page.addInitScript(() => {
  let s = 12345;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
});
await page.goto(`${baseUrl}/?qa=1&world=0`);
await page.waitForSelector("#enter");
await page.tap("#enter");
for (let i = 0; i < 4000; i++) {
  if (await page.evaluate(() => !!(window.__qa?.game && window.__qa.state().loaded))) break;
  await page.clock.runFor(16);
  await page.waitForTimeout(10);
}
for (let i = 0; i < 40; i++) { await page.clock.runFor(16); await page.waitForTimeout(50); }
const frames = async (n) => { for (let i = 0; i < n; i++) { await page.clock.runFor(16); await page.waitForTimeout(30); } };
const shots = [["start", 0.5, 0.8075], ["stair-foot", 0.2, 0.76], ["beside-stack", 0.185, 0.69], ["stack-ground", 0.16, 0.655]];
for (const [name, x, y] of shots) {
  const info = await page.evaluate(async ([x, y]) => {
    const g = window.__qa.game, w = window.__qa.world;
    // the old layout refuses to place the player on the sandbag stack ("London entry is blocked"): step off it toward the street
    let pos = null;
    for (let k = 0; k < 12 && !pos; k++) { try { pos = await w.loadArea("westminster", { x: x + 0.01 * k, y: y + 0.01 * k }); } catch (e) { pos = null; } }
    g.player.pos = { ...pos };
    g.enemies = [];
    w.update(g.player.pos, 0, innerWidth, innerHeight, true);
    return { area: w.areaId, pos };
  }, [x, y]);
  await frames(100);
  await page.screenshot({ path: path.join(outDir, `${label}-${name}.png`) });
  console.log(label, name, JSON.stringify(info));
}
await browser.close();
