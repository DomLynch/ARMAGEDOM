// Built-game boot check: serves the PRODUCTION build (Web/dist) on loopback, loads it in headless Chromium and fails on anything a
// player would hit at start. The unbundled source tests cannot see build-time breakage (release 311: the build's lowering of a default
// parameter emitted out-of-scope code, "ReferenceError: i is not defined", and the built game never booted while every source test passed).
//
//   node scripts/boot-check.mjs [--dist dist] [--out boot-check-out]
//
// Phase 1 "boot":     page load; the game bundle must run (window.__armagedomBooted) without the boot-failure card.
// Phase 2 "new game": a fresh browser profile (no save) clicks "Enter Westminster" and must reach loaded:true in the QA bridge, then
//                     the game must step (game.time advances), so the render loop is alive.
// Fails on: ARMAGEDOM_BOOT_FAILED, any uncaught page error, any console.error, any failed same-origin request, any window.__qa error.
// Waits use readiness signals only (waitForFunction), never fixed sleeps. Needs the `playwright` package and its chromium.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(root, arg("dist", "dist"));
const out = path.resolve(root, arg("out", "boot-check-out"));
const TOTAL_MS = 85_000; // tuning-ok: CI tool, hard cap for the whole check (the job budget is under 90 s)
const BOOT_MS = 30_000; // tuning-ok: CI tool, the bundle must start within this
const LOAD_MS = 50_000; // tuning-ok: CI tool, Westminster must finish loading within this on a software-GL runner

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".ktx2": "image/ktx2",
};

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    // No backend here: the world gate's status read (src/data/world.json statusPath) gets "world closed", the real single-player answer.
    if (url.pathname === "/arma/api/status") {
      res.writeHead(200, { "content-type": "application/json" }).end('{"enabled":false,"open":false}');
      return;
    }
    const file = path.join(dist, path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ""));
    const target = file.endsWith(path.sep) || (fs.existsSync(file) && fs.statSync(file).isDirectory()) ? path.join(file, "index.html") : file;
    if (!target.startsWith(dist) || !fs.existsSync(target)) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(target)] ?? "application/octet-stream" });
    fs.createReadStream(target).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function main() {
  if (!fs.existsSync(path.join(dist, "index.html"))) throw Error(`no production build at ${dist} (run npm run build first)`);
  const { chromium } = await import(pathToFileURL(path.join(root, "node_modules/playwright/index.mjs")).href);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const log = [];
  const problems = [];
  const note = (line) => log.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${line}`);
  const t0 = Date.now();
  // Software GL so the real WebGLRenderer starts on a runner with no GPU.
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--mute-audio"],
  });
  let page;
  const watchdog = setTimeout(() => {
    problems.push(`timeout: boot check exceeded ${TOTAL_MS / 1000} s`);
    note("TIMEOUT watchdog");
    finish(1);
  }, TOTAL_MS);
  let finished = false;
  async function finish(code) {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    if (code) {
      try {
        await page?.screenshot({ path: path.join(out, "failure.png"), timeout: 5000 });
      } catch {}
    }
    fs.writeFileSync(path.join(out, "boot-check.log"), `${log.join("\n")}\n${problems.map((p) => `PROBLEM ${p}`).join("\n")}\n`);
    for (const line of log) console.log(line);
    for (const p of problems) console.error(`BOOT CHECK FAIL: ${p}`);
    console.log(code ? "built-game boot: FAIL" : "built-game boot: PASS (boot, new game, render loop)");
    await browser.close().catch(() => {});
    server.close();
    process.exit(code);
  }
  try {
    // A fresh context per run is a fresh profile: no save, so Enter is the new-game path.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    page = await context.newPage();
    page.on("console", (m) => {
      note(`console.${m.type()} ${m.text().slice(0, 300)}`);
      if (m.type() === "error") problems.push(`console.error: ${m.text().slice(0, 300)}`);
    });
    page.on("pageerror", (e) => problems.push(`uncaught page error: ${String(e.stack ?? e).slice(0, 500)}`));
    page.on("requestfailed", (r) => {
      if (r.url().startsWith(origin)) problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`);
    });
    page.on("response", (r) => {
      if (r.url().startsWith(origin) && r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
    });

    note("phase 1: boot");
    await page.goto(`${origin}/?qa=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__armagedomBooted === true || document.getElementById("enter")?.hasAttribute("data-boot-retry"),
      null,
      { timeout: BOOT_MS },
    );
    if (!(await page.evaluate(() => window.__armagedomBooted === true))) problems.push("the game bundle did not start (boot-failure card shown)");
    if (problems.length) return finish(1);
    // The QA bridge must exist on this loopback ?qa=1 page: it is the readiness signal for phase 2.
    await page.waitForFunction(() => !!window.__qa, null, { timeout: BOOT_MS });
    note("phase 1 ok: bundle booted");

    note("phase 2: new game (Enter Westminster)");
    await page.waitForFunction(() => !document.getElementById("enter")?.disabled, null, { timeout: BOOT_MS });
    await page.click("#enter");
    await page.waitForFunction(() => window.__qa.state().loaded === true || window.__qa.errors.length > 0, null, { timeout: LOAD_MS });
    const state = await page.evaluate(() => window.__qa.state());
    if (!state.loaded) problems.push(`Westminster did not load: ${JSON.stringify(await page.evaluate(() => window.__qa.errors))}`);
    else {
      note(`loaded: ${JSON.stringify(state)}`);
      // The render loop is alive when the game clock advances.
      const t = state.time ?? 0;
      await page.waitForFunction((t0) => (window.__qa.state().time ?? 0) > t0, t, { timeout: 20_000 });
    }
    const bridged = await page.evaluate(() => window.__qa.errors);
    for (const e of bridged) problems.push(`game error (${e.type}): ${e.message}`);
    return finish(problems.length ? 1 : 0);
  } catch (error) {
    problems.push(String(error?.message ?? error).split("\n")[0]);
    return finish(1);
  }
}

main().catch((error) => {
  console.error(`BOOT CHECK FAIL: ${error.message}`);
  process.exit(1);
});
