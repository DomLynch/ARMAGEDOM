// Browser proof (dev tool, never shipped): node tools/bullet-impulse-still.mjs  (needs a Chromium; playwright-core is installed when missing).
// Kills the real hunter GLB through the real physics-death.js seam once per weapon (?weapon=pistol|shotgun|grenade|knife) and writes
// $STILLS/<weapon>-<age>s.png at 375x812@2x, plus the lowest and furthest bone position per weapon: same hit direction, different weapon row.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "vite";

const PORT = 38795, OUT = process.env.STILLS ?? "/tmp/stills-bullet", AGES = [0, 0.3, 0.6, 1.0, 1.6, 3.0];
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
for (const weapon of (process.env.WEAPONS ?? "knife,pistol,shotgun,grenade").split(",")) {
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })).newPage(),
    logs = [];
  page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/tools/physics-pilot-stand.html?physics=1&weapon=${weapon}`);
  await page.waitForFunction(() => window.stand?.ready, null, { timeout: 40000 });
  await page.waitForTimeout(8000); // the idle preload of the lazy chunk
  await page.evaluate(() => window.stand.advance(0.4));
  let t = 0.4;
  for (const age of AGES) {
    const target = 0.5 + age;
    while (t < target - 1e-9) { await page.evaluate((dt) => window.stand.advance(dt), 1 / 60); t += 1 / 60; }
    await page.screenshot({ path: `${OUT}/${weapon}-${age.toFixed(1)}s.png` });
  }
  const bones = await page.evaluate(() => window.probe()),
    reach = Math.max(...Object.values(bones).map(([x]) => Math.abs(x)));
  console.log(weapon, JSON.stringify(await page.evaluate(() => window.stand.state())), "max |x| of probed bones", reach.toFixed(2), logs.filter((l) => /error|PAGEERROR/i.test(l)).slice(0, 3).join(" | "));
  await page.context().close();
}
await browser.close();
await server.close();
