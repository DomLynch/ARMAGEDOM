// Viral death cam proof (dev tool, never shipped): node tools/death-cam-proof.mjs [--out /tmp/dc] [--seconds 20] [--b64]
// Real game at 375x812@2x with ?qa=1 (headless, software GL; REAL_GPU=1 for a real GPU, CHROME=<exe>). Three runs:
//   off   ?noshare=1, frame times over --seconds of play (the baseline)
//   on    default: the same measurement, plus the time spent in the ring's own drawImage copies; then a synthetic big blast and a
//         synthetic player death (events injected into the next simulation step, the way combat emits them), the SHARE card until its
//         button is enabled, a still of the card, and the Share clip tap with navigator.share stubbed (type, size, name of the file)
//   none  the same death with MediaRecorder removed: the card must offer the picture and share a PNG
// Prints one JSON line (and with --b64 the card stills as base64 between STILL markers, for a job that cannot return files).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "vite";

const arg = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d),
  OUT = arg("out", "/tmp/dc"),
  SECONDS = Number(arg("seconds", 20)),
  PORT = 38797;
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
    : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio"],
});
const errors = [];

async function open(query, { noRecorder = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
  page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message}`));
  await page.route("**/arma/api/**", (r) => r.fulfill({ status: 503, json: { error: "harness" } }));
  if (noRecorder) await page.addInitScript(() => Object.defineProperty(window, "MediaRecorder", { value: undefined }));
  await page.addInitScript(() => {
    // Time spent in the ring's own copies (a 2D canvas as wide as the ring frame); the app draws nothing else that small.
    window.__ring = { ms: 0, n: 0 };
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      if (this.canvas.width !== 180 || this.canvas.height !== 320) return draw.apply(this, args);
      const t = performance.now();
      const result = draw.apply(this, args);
      window.__ring.ms += performance.now() - t;
      window.__ring.n++;
      return result;
    };
  });
  await page.goto(`http://127.0.0.1:${PORT}/?qa=1&physics=0${query}`);
  await page.click("#enter");
  await page.waitForFunction(() => window.__qa?.state().loaded && window.__qa.game?.enemies, null, { timeout: 240000 });
  await page.waitForTimeout(4000);
  return page;
}
// Frame intervals (requestAnimationFrame) over `seconds`, as median and 95th percentile in ms, and the mean fps.
const frames = (page, seconds) =>
  page.evaluate(
    (s) =>
      new Promise((resolve) => {
        const gaps = [];
        let last = performance.now();
        const start = last;
        const tick = (now) => {
          gaps.push(now - last);
          last = now;
          if (now - start < s * 1000) return requestAnimationFrame(tick);
          gaps.sort((a, b) => a - b);
          const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
          const at = (q) => +gaps[Math.floor(gaps.length * q)].toFixed(2);
          resolve({ n: gaps.length, medianMs: at(0.5), p95Ms: at(0.95), fps: +(1000 / mean).toFixed(1) });
        };
        requestAnimationFrame(tick);
      }),
    seconds,
  );
// Events are injected into the next simulation step (stepGame replaces game.events each step), so the loop observes them as combat's.
const inject = (page, events) =>
  page.evaluate((list) => {
    const g = window.__qa.game;
    let current = g.events;
    let pending = list.map((e) => (e.actor === "player" ? { ...e, actor: g.player } : e)); // "player" names the real player object
    Object.defineProperty(g, "events", {
      configurable: true,
      get: () => current,
      set(value) {
        current = value;
        if (pending) {
          current.push(...pending);
          pending = null;
        }
      },
    });
  }, events);
const kill = (page) =>
  page.evaluate(() => {
    const g = window.__qa.game,
      p = g.player;
    g.enemies = [];
    p.hp = 0;
    p.response = { clip: "Death", start: g.time, ticks: 90 };
    g.finished = true;
    g.won = false;
  });
const b64 = [];
async function still(page, name) {
  const buffer = await page.screenshot({ path: `${OUT}/${name}.png` });
  // A job log line is cut at about 16 KB: the PNG goes out in numbered 8000-character pieces.
  if (process.argv.includes("--b64")) {
    const text = buffer.toString("base64");
    for (let i = 0; i * 8000 < text.length; i++) b64.push(`STILL ${name} ${i} ${text.slice(i * 8000, (i + 1) * 8000)}`);
  }
}
async function cardRun(query, options, name) {
  const page = await open(query, options);
  await inject(page, [{ type: "grenade-blast", radius: 3, position: { x: 0, z: 0 } }]);
  await page.waitForTimeout(6000); // the blast settles a tail later; a few more seconds of ring behind the death
  await inject(page, [{ type: "death", actor: "player" }]);
  await page.waitForTimeout(500); // the step that carries the event runs before the player is marked finished
  await kill(page);
  await page.waitForSelector("#share-card:not([hidden])", { timeout: 20000 });
  await page.waitForTimeout(600);
  await still(page, `${name}-making`);
  const t0 = Date.now();
  await page.waitForFunction(() => !document.getElementById("share-send").disabled, null, { timeout: 120000 }).catch(() => {});
  const result = {
    madeInMs: Date.now() - t0,
    label: await page.textContent("#share-send-label"),
    status: await page.textContent("#share-status"),
    thumbs: await page.$$eval(".share-pick", (list) => list.map((b) => b.dataset.id)),
    mediaRecorder: await page.evaluate(
      () => typeof MediaRecorder !== "undefined" && ["video/mp4", "video/webm"].map((t) => [t, MediaRecorder.isTypeSupported(t)]),
    ),
  };
  await still(page, `${name}-ready`);
  await page.evaluate(() => {
    navigator.canShare = () => true;
    navigator.share = async (data) => {
      const file = data.files[0];
      window.__shared = { name: file.name, type: file.type, size: file.size, text: data.text, title: data.title };
    };
  });
  result.sendEnabled = await page.evaluate(() => !document.getElementById("share-send").disabled);
  await page.click("#share-send", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
  result.shared = await page.evaluate(() => window.__shared ?? null);
  result.afterStatus = await page.textContent("#share-status");
  await page.close();
  return result;
}

const out = { seconds: SECONDS };
const off = await open("&noshare=1");
out.off = await frames(off, SECONDS);
out.offRing = await off.evaluate(() => window.__ring);
await off.close();
const on = await open("");
out.on = await frames(on, SECONDS);
out.onRing = await on.evaluate(() => window.__ring);
await on.close();
out.recorded = await cardRun("", {}, "card");
out.fallback = await cardRun("", { noRecorder: true }, "card-picture");
out.errors = errors.slice(0, 8);
writeFileSync(`${OUT}/result.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));
for (const line of b64) console.log(line);
await browser.close();
await server.close();
