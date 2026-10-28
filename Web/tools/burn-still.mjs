// Browser proof (dev tool, never shipped): node tools/burn-still.mjs  (needs a Chromium; playwright-core is installed when missing).
// Plays the living and dying burn scenes on the real hunter GLB through the real engine/burn-presentation.js and writes
// $STILLS/{before,after}-<scene>-<seconds>s.png at 375x812@2x. "before" is ?burn=0 (the off switch), "after" is the default.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "vite";

const PORT = 38796,
  OUT = process.env.STILLS ?? "/tmp/stills-burn",
  FRAMES = [
    ["living", 0.1],
    ["living", 1.4],
    ["living", 2.6],
    ["dying", 1.4],
    ["dying", 3.5],
    ["dying", 8.0],
  ];
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright-core"));
} catch {
  execFileSync("npm", ["i", "--no-save", "--no-audit", "--no-fund", "playwright-core@1.62.1"], { stdio: "inherit" });
  ({ chromium } = require("playwright-core"));
}
const server = await createServer({ server: { port: PORT, host: "127.0.0.1", strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME || undefined,
  args: process.env.REAL_GPU
    ? ["--ignore-gpu-blocklist", "--enable-gpu", "--mute-audio"]
    : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--mute-audio"],
});
for (const [label, query] of [["before", "?burn=0"], ["after", ""]]) {
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })).newPage(),
    logs = [];
  page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/tools/burn-stand.html${query}`);
  await page.waitForFunction(() => window.stand?.ready, null, { timeout: 40000 });
  for (const [scene, seconds] of FRAMES) {
    const snap = await page.evaluate(([s, t]) => window.stand.show(s, t), [scene, seconds]);
    await page.screenshot({ path: `${OUT}/${label}-${scene}-${seconds.toFixed(1)}s.png` });
    console.log(label, scene, seconds, JSON.stringify(snap));
  }
  const bad = logs.filter((l) => /error|PAGEERROR/i.test(l));
  if (bad.length) console.log("console problems:", bad.slice(0, 3).join(" | "));
  await page.context().close();
}
await browser.close();
await server.close();
