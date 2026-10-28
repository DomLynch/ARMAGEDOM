// Browser proof (dev tool, never shipped): node tools/shop-still.mjs   (PW_PATH = a dir holding playwright-core, CHROME = a Chromium).
// Serves Web/ with vite, opens tools/shop-stand.html headless at 375x812 (and 1280x720 for the BUY tab) and writes the stills to $STILLS.
// With PRINT_B64=1 each PNG is also printed between markers (for a job that has no file hand-back): SHOP-PNG <name> <base64> END.
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "vite";

const PORT = 38797, OUT = process.env.STILLS ?? "/tmp/shop-stills";
mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(`${process.env.PW_PATH ?? "."}/x.js`)("playwright-core");
const server = await createServer({ server: { port: PORT, host: "127.0.0.1", strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || undefined, args: ["--mute-audio"] });
const logs = [];
async function shoot(name, width, height, states) {
  const page = await (await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })).newPage();
  page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/tools/shop-stand.html`);
  await page.waitForFunction(() => window.stand?.ready, null, { timeout: 60000 });
  for (const state of states) {
    await page.evaluate((s) => window.stand.show(s), state);
    const path = `${OUT}/${name}-${state}-${width}.png`;
    await page.screenshot({ path });
    if (process.env.PRINT_B64) console.log(`SHOP-PNG ${name}-${state}-${width} ${readFileSync(path).toString("base64")} END`);
  }
  await page.context().close();
}
await shoot("shop", 375, 812, ["buy", "sell", "error", "closed", "offline"]);
await shoot("shop", 1280, 720, ["buy"]);
console.log(logs.filter((l) => /error|PAGEERROR/i.test(l)).slice(0, 5).join(" | ") || "no console errors");
await browser.close();
await server.close();
