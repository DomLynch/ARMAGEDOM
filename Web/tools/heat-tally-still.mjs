// Heat tally design-option stills (dev tool, never shipped): node tools/heat-tally-still.mjs [--out DIR]
// Real game at 375x812@2x and 1280x720@1 (headless, --mute-audio; REAL_GPU=1 for the Mac GPU, CHROME=<exe>), Westminster start. For each
// style A/B/C it sets window.__heatPreview ({ style, count, lastAlpha }; local ?qa=1 only) at counts 1, 3, 5, 7 and 7 with the newest mark
// fading, takes the full frame and a crop round the player, then builds X.png, X-desktop.png and compare.png (375 wide) from the crops.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "vite";

const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d),
  OUT = arg("out", "/tmp/heat-options"),
  PORT = 38796,
  STYLES = ["A", "B", "C"],
  STEPS = [
    { id: "1", count: 1, lastAlpha: 1, label: "1" },
    { id: "3", count: 3, lastAlpha: 1, label: "3" },
    { id: "5", count: 5, lastAlpha: 1, label: "5" },
    { id: "7", count: 7, lastAlpha: 1, label: "7" },
    { id: "7fade", count: 7, lastAlpha: 0.4, label: "7, newest fading" },
  ],
  VIEWPORTS = [
    { id: "m", width: 375, height: 812, dpr: 2, cropW: 260, cropH: 195, cropUp: 168 },
    { id: "d", width: 1280, height: 720, dpr: 1, cropW: 420, cropH: 300, cropUp: 250 },
  ],
  LABELS = {
    A: "A  Crimson upright claw slashes",
    B: "B  Burnt amber angled rake scratches",
    C: "C  Crimson on a torn ash plate, claws from one point",
  };
mkdirSync(`${OUT}/raw`, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const server = await createServer({ server: { port: PORT, host: "127.0.0.1", strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME || undefined,
  args: process.env.REAL_GPU ? ["--ignore-gpu-blocklist", "--enable-gpu", "--mute-audio"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio"],
});
const errors = [],
  shots = {}; // shots[vp][style][step] = file
for (const vp of VIEWPORTS) {
  const page = await (await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, hasTouch: vp.id === "m" })).newPage();
  page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message}`));
  await page.route("**/arma/api/**", (r) => r.fulfill({ status: 503, json: { error: "harness" } }));
  await page.goto(`http://127.0.0.1:${PORT}/?qa=1&physics=0`);
  await page.click("#enter");
  await page.waitForFunction(() => window.__qa?.state().loaded && window.__qa.game?.enemies, null, { timeout: 180000 });
  await page.evaluate(() => {
    window.__qa.game.enemies = [];
  });
  await page.waitForTimeout(2500);
  shots[vp.id] = {};
  for (const style of STYLES) {
    shots[vp.id][style] = {};
    for (const step of STEPS) {
      await page.evaluate((p) => (window.__heatPreview = p), { style, count: step.count, lastAlpha: step.lastAlpha });
      await page.waitForTimeout(500);
      const at = await page.evaluate(() => {
        const w = window.__qa.world, g = window.__qa.game;
        w.camera.updateMatrixWorld();
        const v = w.toRender(g.player.pos, 0).project(w.camera);
        return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
      });
      const x0 = Math.max(0, Math.min(vp.width - vp.cropW, Math.round(at.x - vp.cropW / 2))),
        y0 = Math.max(0, Math.min(vp.height - vp.cropH, Math.round(at.y - vp.cropUp))),
        file = `${OUT}/raw/${vp.id}-${style}-${step.id}.png`;
      await page.screenshot({ path: file.replace(".png", "-full.png") });
      await page.screenshot({ path: file, clip: { x: x0, y: y0, width: vp.cropW, height: vp.cropH } });
      shots[vp.id][style][step.id] = file;
    }
  }
  await page.close();
}
const img = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`,
  css = `body{margin:0;background:#0b0a0a;color:#e9e1d2;font:13px/1.3 system-ui,sans-serif}h2{font-size:15px;margin:14px 12px 6px}.g{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 6px 10px}figure{margin:0;position:relative}figure img{width:100%;display:block;border-radius:4px}figcaption{position:absolute;left:6px;top:4px;background:#000a;padding:1px 6px;border-radius:3px;font-size:12px}`,
  sheet = (styles, vpId, width) => `<style>${css}</style>${styles.map((s) => `<h2>${LABELS[s]}</h2><div class=g>${STEPS.map((t) => `<figure><img src="${img(shots[vpId][s][t.id])}"><figcaption>${t.label}</figcaption></figure>`).join("")}</div>`).join("")}`;
const out = await (await browser.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 2 })).newPage();
for (const [name, styles, vpId, width] of [
  ...STYLES.map((s) => [s, [s], "m", 375]),
  ...STYLES.map((s) => [`${s}-desktop`, [s], "d", 1280]),
  ["compare", STYLES, "m", 375],
]) {
  await out.setViewportSize({ width, height: 800 });
  await out.setContent(sheet(styles, vpId, width));
  await out.waitForTimeout(300);
  await out.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}
writeFileSync(`${OUT}/errors.json`, JSON.stringify(errors));
console.log(JSON.stringify({ out: OUT, errors: errors.slice(0, 5) }));
await browser.close();
await server.close();
