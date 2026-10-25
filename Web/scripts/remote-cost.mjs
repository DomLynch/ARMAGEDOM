// Cost of the other players (dev tool, never shipped): loads the dev server page in headless Chrome against scripts/world-harness.mjs
// (real presence server + N standing bots, no Supabase, no VPS) and reports the renderer's draw calls and triangles per frame
// (?stats=1) plus the frame time p50/p95 from requestAnimationFrame, with the GPU string.
//   node scripts/world-harness.mjs --origin http://127.0.0.1:8890 --walk north,east,...   (N entries = N bots; none for 0)
//   node scripts/remote-cost.mjs [--seconds 20] [--width 375] [--height 812] [--out result.json] [--check zero-result.json]
// Budget check: run once with 0 bots and --out zero.json, then with 8 bots and --check zero.json (exit 1 when over budget).
// Needs playwright-core (PLAYWRIGHT_CORE=<path to its index.mjs>) and a Chrome (PLAYWRIGHT_BROWSERS_PATH or CHROME=<executable>).
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const seconds = Number(arg("seconds", 20)),
  width = Number(arg("width", 375)),
  height = Number(arg("height", 812)),
  page_url = arg("url", "http://127.0.0.1:8890/?presenceUrl=ws://127.0.0.1:8892&stats=1");
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_CORE ?? "playwright-core").href);

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME,
  args: ["--mute-audio", "--ignore-gpu-blocklist", "--enable-gpu"],
});
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
const page = await context.newPage();
// The world is open (a status read the harness has no server for); the writer is not there: its ops fail, nothing is created.
// (Playwright tries the routes added last first, so the catch-all goes first.)
await page.route("**/arma/api/**", (route) => route.fulfill({ status: 503, json: { error: "harness" } }));
await page.route("**/arma/api/status", (route) => route.fulfill({ json: { enabled: true, open: true, allowed: true } }));
await page.addInitScript(() => {
  localStorage.setItem(
    "armagedom.world.session.v1",
    JSON.stringify({ access_token: "harness-me", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 86400, user_id: "me", anonymous: true }),
  );
});
const lines = [];
page.on("console", (message) => lines.push(message.text()));
page.on("pageerror", (error) => lines.push(`PAGEERROR ${error.message}`));
await page.goto(page_url);
await page.click("#enter");
await page.waitForFunction(() => document.getElementById("enter")?.hidden || document.querySelector("#hud")?.hidden === false, null, { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(8000); // models, the first remote joins, the stats counter starts
const gpu = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2"),
    ext = gl?.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
});
const frames = await page.evaluate(
  (ms) =>
    new Promise((resolve) => {
      const times = [];
      let last = performance.now();
      const stop = last + ms;
      const tick = (t) => {
        times.push(t - last);
        last = t;
        if (t < stop) requestAnimationFrame(tick);
        else resolve(times.slice(2));
      };
      requestAnimationFrame(tick);
    }),
  seconds * 1000,
);
if (process.env.DEBUG_LINES) console.error(lines.slice(0, 40).join("\n"));
await page.screenshot({ path: process.env.SHOT ?? "/tmp/remote-cost.png" });
const q = (p) => [...frames].sort((a, b) => a - b)[Math.min(frames.length - 1, Math.floor(p * frames.length))];
const stat = lines.filter((l) => l.includes("[arma-world] frame draw calls=")).map((l) => /calls=(\d+) triangles=(\d+) remotes=(\d+)/.exec(l).slice(1).map(Number));
const last = stat.at(-1);
const result = {
  gpu,
  viewport: `${width}x${height}@2`,
  frames: frames.length,
  frameMs: { p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +q(1).toFixed(1) },
  lastStats: last && { drawCalls: last[0], triangles: last[1], remotes: last[2] },
  statLines: stat.length,
  errors: lines.filter((l) => /PAGEERROR|ARMAGEDOM_LOAD_FAILED/.test(l)).slice(0, 3),
};
console.log(JSON.stringify(result));
await browser.close();
if (arg("out", null)) writeFileSync(arg("out"), JSON.stringify(result));
// --check <zero.json>: this run is the one WITH remotes; the file is the --out of a run with none. Exits 1 over the budget
// (Web/src/data/renderBudget.json), so the per-remote cost cannot creep unnoticed.
if (arg("check", null)) {
  const { remoteCostProblems } = await import("../src/engine/render-budget.js");
  const zero = JSON.parse(readFileSync(arg("check"), "utf8")).lastStats;
  const problems = result.errors.length ? [`page errors: ${result.errors.join("; ")}`] : remoteCostProblems(zero, result.lastStats);
  for (const problem of problems) console.error(`remote cost over budget: ${problem}`);
  console.log(problems.length ? "BUDGET FAIL" : "BUDGET OK");
  process.exitCode = problems.length ? 1 : 0;
}
