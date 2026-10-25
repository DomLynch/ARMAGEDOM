// Bytes (and time) before first input (dev tool, never shipped): serves a built dist/ over loopback, shapes the connection like 4G in the
// SERVER (one shared bandwidth budget for every request, a round-trip delay before each response, so workers and prefetches are covered
// too), loads the page the way a visitor does, clicks Enter, and counts every response byte actually sent (gzip for text, as the real
// server does) until the game is loaded and can take input. Lists the largest requests.
//   node scripts/load-bytes.mjs --dist dist [--mbps 9] [--rtt-ms 170] [--fail <substring>] [--json out.json]
// Needs playwright-core (PLAYWRIGHT_CORE=<index.mjs>) and a Chrome (CHROME=<executable>). --fail answers 503 to URLs containing the
// substring, to see what the page does when a file cannot be fetched (SHOT is the screenshot path).
import http from "node:http";
import zlib from "node:zlib";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const dist = normalize(arg("dist", "dist")),
  mbps = Number(arg("mbps", 9)),
  rttMs = Number(arg("rtt-ms", 170)),
  failPartArg = arg("fail", null),
  hangPartArg = arg("hang", null), // URLs containing this never answer (a stalled connection)
  recover = process.argv.includes("--recover"), // after a failed load: stop failing, press the button again, and see whether the game starts
  bytesPerMs = (mbps * 1e6) / 8 / 1000;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".webp": "image/webp", ".png": "image/png", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav" };
const GZIP = new Set([".html", ".js", ".css", ".json"]);
let failPart = failPartArg,
  hangPart = hangPartArg;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let phase = "page",
  linkFree = 0; // the shared link: the time (ms) at which it is next free
const t0 = Date.now(),
  served = [];

async function paced(res, body, row) {
  await sleep(rttMs);
  for (let at = 0; at < body.length; at += 16384) {
    const chunk = body.subarray(at, at + 16384),
      start = Math.max(Date.now(), linkFree);
    linkFree = start + chunk.length / bytesPerMs;
    await sleep(Math.max(0, linkFree - Date.now()));
    if (res.destroyed) return;
    res.write(chunk);
    row.bytes += chunk.length;
  }
  row.end = Date.now() - t0;
  res.end();
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x"),
    row = { url: url.pathname + url.search, at: Date.now() - t0, phase, bytes: 0, end: null, status: 200 };
  served.push(row);
  res.on("close", () => (row.aborted = row.end === null));
  let path = normalize(join(dist, decodeURIComponent(url.pathname)));
  if (!path.startsWith(dist)) return res.writeHead((row.status = 403)).end();
  if (failPart && req.url.includes(failPart)) {
    row.status = 503;
    return void sleep(rttMs).then(() => res.writeHead(503).end());
  }
  if (hangPart && req.url.includes(hangPart)) {
    row.status = "hung";
    return; // never answered
  }
  try {
    if (statSync(path).isDirectory()) path = join(path, "index.html");
    const ext = extname(path);
    let body = readFileSync(path);
    const headers = { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "no-store" };
    if (GZIP.has(ext) && /gzip/.test(req.headers["accept-encoding"] ?? "")) {
      body = zlib.gzipSync(body, { level: 6 });
      headers["Content-Encoding"] = "gzip";
    }
    headers["Content-Length"] = body.length;
    res.writeHead(200, headers);
    paced(res, body, row);
  } catch {
    row.status = 404;
    sleep(rttMs).then(() => res.writeHead(404, { "Content-Type": "application/json" }).end('{"error":"route"}'));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_CORE ?? "playwright-core").href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME, args: ["--mute-audio", "--ignore-gpu-blocklist", "--enable-gpu"] });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const lines = [];
page.on("console", (m) => lines.push(`${m.type()}: ${m.text()}`.slice(0, 240)));
page.on("pageerror", (e) => lines.push(`pageerror: ${e.message}`.slice(0, 240)));

// "Quiet": no request started, finished or moved a byte for `ms`.
const sentBytes = () => served.reduce((n, r) => n + r.bytes, 0);
async function quiet(ms) {
  let last = "",
    since = Date.now();
  for (;;) {
    const sig = `${served.length}/${sentBytes()}/${served.filter((r) => r.end === null && !r.aborted && r.status === 200).length}`;
    if (sig !== last) {
      last = sig;
      since = Date.now();
    } else if (Date.now() - since >= ms) return;
    if (Date.now() - t0 > 900000) throw Error("page never went quiet");
    await sleep(200);
  }
}
await page.goto(`${base}?qa=1`, { waitUntil: "domcontentloaded" });
await quiet(3000);
const entryAt = Date.now() - t0,
  entryBytes = sentBytes(),
  entryText = await page.textContent("#enter").catch(() => null);
phase = "enter";
await page.click("#enter");
let loaded = true;
await page.waitForFunction(() => globalThis.__qa?.state?.().loaded === true, null, { timeout: Number(arg("timeout-ms", 300000)) }).catch(() => (loaded = false));
const loadedAt = Date.now() - t0,
  bytesAtLoaded = sentBytes();
await quiet(2000);
let recovered = null;
if (recover && !loaded) {
  failPart = null;
  hangPart = null;
  const button = await page.evaluate(() => ({ text: document.getElementById("enter")?.textContent, disabled: document.getElementById("enter")?.disabled }));
  recovered = { buttonBefore: button, started: false };
  if (!button.disabled) {
    const from = served.length;
    await page.click("#enter");
    recovered.started = await page.waitForFunction(() => globalThis.__qa?.state?.().loaded === true, null, { timeout: 90000 }).then(() => true, () => false);
    recovered.requests = served.slice(from).map((r) => ({ url: r.url, status: r.status, sent: r.bytes, done: r.end !== null }));
    recovered.text = await page.evaluate(() => document.body.innerText.slice(0, 200)).catch(() => null);
  }
}
const state = await page.evaluate(() => ({ qa: globalThis.__qa?.state?.() ?? null, enter: document.getElementById("enter")?.textContent, enterDisabled: document.getElementById("enter")?.disabled, hudHidden: document.getElementById("hud")?.hidden, text: document.body.innerText.slice(0, 400) })).catch(() => null);
await page.screenshot({ path: process.env.SHOT ?? "/tmp/load-bytes.png" });
await browser.close();
server.close();

const ok = served.filter((r) => r.status === 200 && r.bytes > 0);
const sum = (rows) => rows.reduce((n, r) => n + r.bytes, 0);
const result = {
  throttle: `${mbps} Mbps shared, ${rttMs} ms round trip per request, gzip for text`,
  loaded,
  entryCard: { text: entryText, atMs: entryAt, bytes: entryBytes },
  loadedAtMs: loadedAt,
  bytesBeforeFirstInput: bytesAtLoaded,
  megabytesBeforeFirstInput: +(bytesAtLoaded / 1048576).toFixed(2),
  bytesAfterSettling: sentBytes(),
  bytesByPhase: { pageToEntryCard: sum(ok.filter((r) => r.phase === "page")), afterEnter: sum(ok.filter((r) => r.phase === "enter")) },
  requests: served.length,
  notOk: served.filter((r) => r.status !== 200).map((r) => ({ url: r.url, status: r.status })),
  aborted: served.filter((r) => r.aborted).map((r) => ({ url: r.url, sent: r.bytes })),
  top10: [...ok].sort((a, b) => b.bytes - a.bytes).slice(0, 10).map((r) => ({ url: r.url, bytes: r.bytes, phase: r.phase, ms: r.end === null ? null : r.end - r.at })),
  finalState: state,
  recovered,
  consoleErrors: lines.filter((l) => /^(error|pageerror)/.test(l)).slice(0, 12),
};
console.log(JSON.stringify(result, null, 1));
if (arg("json", null)) writeFileSync(arg("json"), JSON.stringify(result, null, 1));
