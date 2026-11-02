// Browser proof (dev tool, never shipped): node tools/star-variant-still.mjs   (PW_PATH = a dir holding playwright-core, CHROME = a Chromium).
// Serves Web/ with vite, opens tools/star-variant-stand.html headless at 375x812@2x with audio muted and writes plain, 1-star and 2-star stills to $STILLS.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "vite";

const PORT = 38796, OUT = process.env.STILLS ?? "/tmp/star-stills";
mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(`${process.env.PW_PATH ?? "."}/x.js`)("playwright-core");
const server = await createServer({ server: { port: PORT, host: "127.0.0.1", strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME || undefined,
  args: ["--mute-audio", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })).newPage(),
  logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
await page.goto(`http://127.0.0.1:${PORT}/tools/star-variant-stand.html`);
await page.waitForFunction(() => window.stand?.ready, null, { timeout: 60000 });
for (const which of ["plain", "1", "2"]) {
  await page.evaluate((w) => window.stand.show(w), which);
  await page.screenshot({ path: `${OUT}/star-${which}.png` });
}
console.log(logs.filter((l) => /error|PAGEERROR/i.test(l)).slice(0, 5).join(" | ") || "no console errors");
await browser.close();
await server.close();
