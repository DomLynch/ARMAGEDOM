// Browser proof (dev tool, never shipped): node tools/hit-reaction-still.mjs   (PW_PATH = a dir holding playwright-core, CHROME = a Chromium).
// Serves Web/ with vite, opens tools/hit-reaction-stand.html at 375x812@2x and writes frame strips of the alive hit reaction to $STILLS:
// one row per weapon/zone, frames at the given ages after the hit. Prints the worst frame time of the reaction.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "vite";

const PORT = 38795, OUT = process.env.STILLS ?? "/tmp/hit-stills", AGES = [0, 0.06, 0.12, 0.25, 0.45, 0.8];
const CASES = [["pistol", "head"], ["rifle", "torso"], ["shotgun", "torso"], ["rocket", "legs"], ["knife", "arms"]];
mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(`${process.env.PW_PATH ?? "."}/x.js`)("playwright-core");
const server = await createServer({ server: { port: PORT, host: "127.0.0.1", strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })).newPage(),
  logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
await page.goto(`http://127.0.0.1:${PORT}/tools/hit-reaction-stand.html`);
await page.waitForFunction(() => window.stand?.ready, null, { timeout: 60000 });
for (const [weapon, zone] of CASES) {
  const started = await page.evaluate(([w, z]) => window.stand.hit(w, z), [weapon, zone]);
  let t = 0;
  for (const age of AGES) {
    while (t < age - 1e-9) {
      await page.evaluate((dt) => window.stand.advance(dt), 1 / 60);
      t += 1 / 60;
    }
    await page.screenshot({ path: `${OUT}/${weapon}-${zone}-${age.toFixed(2)}s.png` });
  }
  console.log(weapon, zone, "started", started, "still active", await page.evaluate(() => window.stand.active()));
}
console.log(logs.filter((l) => /error|PAGEERROR/i.test(l)).slice(0, 5).join(" | ") || "no console errors");
await browser.close();
await server.close();
