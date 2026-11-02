// Browser proof (dev tool, never shipped): node tools/pitborn-cuts-still.mjs  (needs a Chromium; installs playwright-core when missing).
// Serves Web/ with vite and plays one Pitborn kill per (weapon, finisher) pair at 375x812@2x on tools/pitborn-cuts-stand.html, writing stills to $STILLS
// (default /tmp/stills): <finisher>-<weapon>-<age>.png, plus a `?cuts=0` plain-ragdoll run for comparison. Prints the plan and the cuts each run made.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "vite";

const PORT = Number(process.env.PORT ?? 38795), OUT = process.env.STILLS ?? "/tmp/stills", AGES = [0, 0.4, 0.8, 1.6, 3.5];
const RUNS = (process.env.RUNS ?? "decapitation:pistol,dismember:shotgun,splitCrown:rifle,opened:grenade,hamstringCut:knife,runThrough:knife,off:shotgun").split(",");
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright-core")); } catch {
  execFileSync("npm", ["i", "--no-save", "--no-audit", "--no-fund", "playwright-core@1.62.1"], { stdio: "inherit" });
  ({ chromium } = require("playwright-core"));
}
const server = await createServer({ server: { port: PORT, host: "127.0.0.1", strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME || undefined,
  args: process.env.REAL_GPU ? ["--ignore-gpu-blocklist", "--enable-gpu"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
for (const run of RUNS) {
  const [finisher, weapon] = run.split(":"),
    off = finisher === "off",
    page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })).newPage(),
    logs = [];
  page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/tools/pitborn-cuts-stand.html?weapon=${weapon}${off ? "&cuts=0" : `&finisher=${finisher}`}`);
  await page.waitForFunction(() => window.stand?.ready, null, { timeout: 60000 });
  await page.waitForTimeout(6000); // the idle preload of the physics chunk
  let t = 0;
  while (t < 0.3) { await page.evaluate(() => window.stand.advance(1 / 60)); t += 1 / 60; } // wounded: the cut GLB is requested
  await page.waitForTimeout(8000); // the cut GLB arrives (about 2 MB gzip on the real site)
  while (t < 0.5) { await page.evaluate(() => window.stand.advance(1 / 60)); t += 1 / 60; }
  for (const age of AGES) {
    const target = 0.5 + age;
    while (t < target - 1e-9) { await page.evaluate((dt) => window.stand.advance(dt), 1 / 60); t += 1 / 60; }
    await page.screenshot({ path: `${OUT}/${finisher}-${weapon}-${age.toFixed(1)}s.png` });
  }
  console.log(run, JSON.stringify(await page.evaluate(() => window.stand.state())), logs.filter((l) => /error|PAGEERROR/i.test(l)).slice(0, 3).join(" | "));
  await page.context().close();
}
await browser.close();
await server.close();
