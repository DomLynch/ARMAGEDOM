// Browser proof (dev tool, never shipped): node tools/physics-pilot-still.mjs  (needs a Chromium; installs playwright-core when missing).
// Serves Web/ with vite on 38794, opens tools/physics-pilot-stand.html at 375x812@2x and writes stills to $STILLS (default /tmp/stills):
//   baked-*.png (no flag), ragdoll-*.png (?physics=1), plus the longest-frame figures with the chunk loaded and with the chunk URL blocked.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";

const PORT = 38794, OUT = process.env.STILLS ?? "/tmp/stills", AGES = [0, 0.3, 0.6, 1.0, 1.6, 3.0];
mkdirSync(OUT, { recursive: true });
let chromium;
try { ({ chromium } = await import("playwright-core")); } catch {
  execFileSync("npm", ["i", "--no-save", "--no-audit", "--no-fund", "playwright-core@1.62.1"], { stdio: "inherit" });
  ({ chromium } = await import("playwright-core"));
}
const server = await createServer({ server: { port: PORT, host: "127.0.0.1", strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const open = async (query, block = false) => {
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })).newPage(),
    logs = [];
  page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
  if (block) await page.route("**/physics-death-impl*", (r) => r.abort());
  await page.goto(`http://127.0.0.1:${PORT}/tools/physics-pilot-stand.html${query}`);
  await page.waitForFunction(() => window.stand?.ready, null, { timeout: 120000 });
  await page.waitForTimeout(query.includes("physics=1") ? 8000 : 500); // the idle preload of the lazy chunk
  return { page, logs };
};
for (const [name, query] of [["baked", ""], ["ragdoll", "?physics=1"]]) {
  const { page, logs } = await open(query);
  await page.evaluate(() => window.stand.advance(0.4));
  let t = 0.4;
  for (const age of AGES) {
    const target = 0.5 + age;
    while (t < target - 1e-9) { await page.evaluate((dt) => window.stand.advance(dt), 1 / 60); t += 1 / 60; }
    await page.screenshot({ path: `${OUT}/${name}-${age.toFixed(1)}s.png` });
  }
  console.log(name, JSON.stringify(await page.evaluate(() => window.stand.state())), logs.filter((l) => /error|PAGEERROR/i.test(l)).slice(0, 3).join(" | "));
}
for (const [label, block] of [["chunk loaded", false], ["chunk BLOCKED", true]]) {
  const { page } = await open("?physics=1", block),
    frames = await page.evaluate(() => window.stand.runRaf(3000)),
    sorted = [...frames].sort((a, b) => a - b);
  console.log(`FRAMES ${label}: n=${frames.length} median=${sorted[sorted.length >> 1].toFixed(1)}ms p95=${sorted[Math.floor(sorted.length * 0.95)].toFixed(1)}ms`
    + ` longest=${sorted[sorted.length - 1].toFixed(1)}ms`, JSON.stringify(await page.evaluate(() => window.stand.state())));
}
await browser.close();
await server.close();
