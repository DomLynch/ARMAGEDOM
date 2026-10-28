// Boot check for the BUILT game (dev tool, never shipped): cd Web && npm run build && node tools/boot-check.mjs
//   PW_PATH = a dir holding playwright-core (default: here), CHROME = a Chromium/Chrome executable, DIST = the build (default ./dist).
// Serves dist/ with vite preview on a loopback port, loads the page headless, presses Enter and fails (exit 1) on ARMAGEDOM_BOOT_FAILED,
// any page error or any console.error. Source tests run unbundled and cannot see build-lowering bugs; this can.
import { createRequire } from "node:module";
import { preview } from "vite";

const PORT = 38822,
  DIST = process.env.DIST ?? "dist";
const { chromium } = createRequire(`${process.env.PW_PATH ?? "."}/x.js`)("playwright-core");
const server = await preview({ root: ".", build: { outDir: DIST }, preview: { port: PORT, host: "127.0.0.1", strictPort: true } });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME || undefined,
  args: ["--mute-audio", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
const failedUrls = [];
page.on("response", (r) => {
  if (r.status() >= 400) failedUrls.push(`${r.status()} ${r.url()}`);
});
page.on("console", (m) => {
  if (m.text().startsWith("Failed to load resource")) return; // reported with its URL below
  if (m.type() === "error" || m.text().includes("ARMAGEDOM_BOOT_FAILED")) problems.push(`console.${m.type()}: ${m.text().slice(0, 300)}`);
});
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.waitForFunction(() => window.__armagedomBooted === true, null, { timeout: 30000 }).catch(() => problems.push("never set __armagedomBooted"));
await page.getByText("Enter Westminster").click({ timeout: 20000 }).catch((e) => problems.push(`no Enter button: ${e.message.split("\n")[0]}`));
await page.waitForTimeout(8000);
const state = await page.evaluate(() => ({
  flash: !!document.getElementById("pickup-flash"),
  hud: !!document.getElementById("notice"),
  boot: document.body.innerText.includes("ARMAGEDOM_BOOT_FAILED"),
}));
// A missing favicon is not a boot problem; any other failed request is listed, and one for a script or style fails the check.
for (const u of failedUrls) {
  console.log(`note: ${u}`);
  if (/\.(js|css|json)(\?|$)/.test(u)) problems.push(`failed request: ${u}`);
}
if (state.boot) problems.push("page shows ARMAGEDOM_BOOT_FAILED");
if (!state.flash || !state.hud) problems.push(`missing DOM: ${JSON.stringify(state)}`);
await browser.close();
await new Promise((r) => server.httpServer.close(r));
console.log(problems.length ? `BOOT CHECK FAILED\n${problems.join("\n")}` : "BOOT CHECK PASSED: built game booted, no page errors, no console errors");
process.exit(problems.length ? 1 : 0);
