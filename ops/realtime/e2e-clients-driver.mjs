// Driven by e2e-local.sh (ARMA_E2E_DRIVER=e2e-clients-driver.mjs ARMA_E2E_DIST=<built Web dist> ARMA_E2E_PLAYWRIGHT=<dir holding node_modules/playwright-core> [ARMA_E2E_CLIENTS=8]).
// N REAL game clients (the unmodified built Web, headless Chromium) playing together on a LOCAL stack. Nothing here talks to the live Supabase project:
//   * the stack is e2e-local.sh's scratch Postgres + the real writer and presence;
//   * one local "edge" origin plays nginx's part: static dist, /arma/api/* -> writer, /arma/ws -> presence (so the client's own relative URLs work);
//   * the client's baked-in Supabase URL is answered by a local fake auth INSIDE the browser (page.route fulfils it, anonymous signup included), and the host
//     is also mapped to an unroutable address with --host-resolver-rules, so even a failed interception could not reach the real project.
// What is measured does not depend on the game's internals: a WebSocket wrapper injected into every page records the presence frames the client sends and receives.
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const env = (name) => process.env[name] ?? (() => { throw new Error(`set ${name}`); })();
const bundle = env("ARMA_E2E_BUNDLE"),
  pgPort = env("ARMA_E2E_PG_PORT"),
  areaJson = env("ARMA_E2E_AREA"),
  dist = env("ARMA_E2E_DIST"),
  CLIENTS = Number(process.env.ARMA_E2E_CLIENTS ?? 8),
  OUT = process.env.ARMA_E2E_OUT ?? process.cwd(),
  PLAY_SECONDS = Number(process.env.ARMA_E2E_SECONDS ?? 45);
const SUPABASE_HOST = "fdbqnupceqytizxnoiua.supabase.co"; // the production project the client is built against: never reachable from here
const AUTH = 18480,
  WRITER = 18891,
  PRESENCE = 18894,
  EDGE = 18080,
  KEY = "e2e-local-only-internal-key";
const ORIGIN = `http://127.0.0.1:${EDGE}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : NaN);
const { chromium } = createRequire(path.join(env("ARMA_E2E_PLAYWRIGHT"), "package.json"))("playwright-core");
const pg = createRequire(path.join(bundle, "package.json"))("pg");
const db = new pg.Client({ host: "127.0.0.1", port: Number(pgPort), user: "postgres", database: "postgres" });
await db.connect();

// ---- fake Supabase Auth (anonymous signup, refresh, who-is-this) ---------------------------------------------------------------------------------
const session = async (id) => {
  const access = `test.${id}.Guest`;
  return { access_token: access, refresh_token: `refresh.${id}`, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id, is_anonymous: true, aud: "authenticated", role: "authenticated" } };
};
const authHandler = async (method, url, headers, body) => {
  const u = new URL(url, "http://x");
  if (method === "POST" && u.pathname === "/auth/v1/signup") {
    const id = randomUUID();
    await db.query("insert into auth.users (id) values ($1)", [id]);
    return [200, await session(id)];
  }
  if (method === "POST" && u.pathname === "/auth/v1/token" && u.searchParams.get("grant_type") === "refresh_token") {
    const id = /^refresh\.([0-9a-f-]{36})$/.exec(JSON.parse(body || "{}").refresh_token ?? "")?.[1];
    return id ? [200, await session(id)] : [400, { error: "invalid_grant" }];
  }
  const m = /^Bearer test\.([0-9a-f-]{36})\.(\w+)$/.exec(headers.authorization ?? "");
  if (method === "GET" && u.pathname === "/auth/v1/user") return m ? [200, { id: m[1], is_anonymous: true, user_metadata: {} }] : [401, { error: "bad token" }];
  return [404, { error: "not found", path: u.pathname }];
};
const authServer = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const [status, body] = await authHandler(req.method, req.url, req.headers, Buffer.concat(chunks).toString());
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
});
await new Promise((resolve) => authServer.listen(AUTH, "127.0.0.1", resolve));

// ---- the edge: nginx's part, on one origin ---------------------------------------------------------------------------------------------------------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".wasm": "application/wasm", ".ktx2": "image/ktx2", ".bin": "application/octet-stream", ".webmanifest": "application/manifest+json" };
const edge = http.createServer((req, res) => {
  const url = new URL(req.url, ORIGIN);
  if (url.pathname.startsWith("/arma/api/")) {
    const up = http.request({ host: "127.0.0.1", port: WRITER, method: req.method, path: "/arma/" + url.pathname.slice("/arma/api/".length) + url.search, headers: { ...req.headers, "x-real-ip": req.socket.remoteAddress.replace(/^::ffff:/, "") } }, (r) => (res.writeHead(r.statusCode, r.headers), r.pipe(res)));
    up.on("error", () => (res.writeHead(502), res.end()));
    return req.pipe(up);
  }
  let file = path.join(dist, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return (res.writeHead(404), res.end("not found"));
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
});
edge.on("upgrade", (req, socket, head) => {
  if (!req.url.startsWith("/arma/ws")) return socket.destroy();
  const up = net.connect(PRESENCE, "127.0.0.1", () => {
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n${req.rawHeaders.reduce((s, h, i) => s + (i % 2 ? `${h}\r\n` : `${h}: `), "")}\r\n`);
    if (head.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
});
await new Promise((resolve) => edge.listen(EDGE, "127.0.0.1", resolve));

// ---- the real services -----------------------------------------------------------------------------------------------------------------------------
const children = [],
  clientlogLines = [];
const start = (script, extra, ready) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(bundle, script)], { cwd: bundle, env: { PATH: process.env.PATH, SUPABASE_URL: `http://127.0.0.1:${AUTH}`, SUPABASE_ANON_KEY: "e2e-local-only", ARMA_INTERNAL_KEY: KEY, ...extra } });
    children.push(child);
    let out = "";
    const watch = (chunk) => ((out += chunk), out.includes(ready) && resolve(child));
    child.stdout.on("data", (chunk) => {
      for (const line of String(chunk).split("\n")) if (line.startsWith("clientlog ")) clientlogLines.push(line.slice(0, 300)); // the beacon's journal lines
    });
    child.stdout.on("data", watch);
    child.stderr.on("data", watch);
    child.on("exit", (code) => reject(new Error(`${script} exited ${code}: ${out}`)));
    setTimeout(() => reject(new Error(`${script} did not start: ${out}`)), 15000);
  });
await start("server/writer/main.js", { ARMA_WRITER: "1", WRITER_PORT: String(WRITER), DATABASE_URL: `postgres://arma_writer:e2e-local-only-writer-pw@127.0.0.1:${pgPort}/postgres` }, "writer listening");
await start("server/presence/main.js", { ARMA_PRESENCE: "1", PRESENCE_PORT: String(PRESENCE), WRITER_URL: `http://127.0.0.1:${WRITER}`, ARMA_AREA_DATA: areaJson, PRESENCE_ORIGINS: ORIGIN }, "presence listening");

let browser;
const finish = async (code) => {
  try { await browser?.close(); } catch {}
  for (const child of children) child.removeAllListeners("exit"), child.kill();
  authServer.close();
  edge.close();
  await db.end().catch(() => {});
  setTimeout(() => process.exit(code), 300);
};
process.on("uncaughtException", (error) => (console.error(`FAIL - ${error.stack ?? error}`), finish(1)));
process.on("unhandledRejection", (error) => (console.error(`FAIL - ${error?.stack ?? error}`), finish(1)));

// ---- one real client --------------------------------------------------------------------------------------------------------------------------------
// Injected before any page script: wraps WebSocket so the harness sees the presence frames, and samples requestAnimationFrame deltas for frame times.
const PAGE_PROBE = `(() => {
  const probe = (window.__e2e = { sent: [], states: [], welcome: null, closes: [], frames: [], errors: [], rpc: [] });
  const Native = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    const ws = new Native(url, protocols);
    if (String(url).includes("/arma/ws")) {
      const send = ws.send.bind(ws);
      ws.send = (data) => { try { const m = JSON.parse(data); if (m.t === "loc") probe.sent.push({ x: m.x, z: m.z, at: performance.now(), wall: Date.now() }); } catch {} return send(data); };
      ws.addEventListener("message", (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m.t === "welcome") probe.welcome = { id: m.id, area: m.area, name: m.name };
          if (m.t === "state") probe.states.push({ at: performance.now(), wall: Date.now(), n: m.players.length, self: m.players.find((p) => p.id === probe.welcome?.id) ?? null, players: m.players.map((p) => [p.id, p.x, p.z]) });
        } catch {}
      });
      ws.addEventListener("close", (e) => probe.closes.push({ code: e.code, at: performance.now() }));
    }
    return ws;
  };
  Object.assign(window.WebSocket, Native);
  window.WebSocket.prototype = Native.prototype;
  let last = performance.now();
  const tick = (t) => { probe.frames.push(t - last); last = t; if (probe.frames.length > 20000) probe.frames.shift(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})();`;

export async function newClient(index) {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, userAgent: undefined });
  await context.addInitScript(PAGE_PROBE);
  // The client's Supabase URL, answered locally. Any other request to that host is aborted; nothing is ever forwarded to it.
  await context.route(`https://${SUPABASE_HOST}/**`, async (route) => {
    const req = route.request();
    const cors = { "access-control-allow-origin": ORIGIN, "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-expose-headers": "*" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const [status, body] = await authHandler(req.method(), new URL(req.url()).pathname + new URL(req.url()).search, req.headers(), req.postData() ?? "");
    return route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => consoleErrors.push(`requestfailed: ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
  // What the client asked of the world and of (the stand-in for) Supabase, and everything it logged: for diagnosing, and for the receipt.
  const net = [],
    logs = [];
  page.on("response", (r) => /\/arma\/|supabase/.test(r.url()) && net.push(`${r.request().method()} ${r.url().replace(ORIGIN, "").slice(0, 90)} ${r.status()}`));
  page.on("console", (m) => logs.push(`${m.type()}: ${m.text().slice(0, 160)}`));
  page.on("websocket", (w) => net.push(`WS ${w.url().replace(ORIGIN, "")}`));
  return { index, context, page, consoleErrors, net, logs, probe: () => page.evaluate(() => window.__e2e) };
}

/** How long a position one client sent took to show up in another client's state frames (same machine, so Date.now() is comparable): { n, p50, p95, max }. */
export const crossLatency = (sender, receiver) => {
  const id = sender.welcome?.id,
    lat = [];
  if (!id) return { n: 0 };
  for (const s of sender.sent) {
    const seen = receiver.states.find((st) => st.wall >= s.wall && st.players.some((p) => p[0] === id && p[1] === s.x && p[2] === s.z));
    if (seen) lat.push(seen.wall - s.wall);
  }
  return { n: lat.length, p50: pct(lat, 50), p95: pct(lat, 95), max: pct(lat, 100) };
};

const summarise = (p) => {
  const frames = p.frames.slice(5);
  const n = p.states.map((s) => s.n);
  const lat = [];
  for (const s of p.sent) {
    const seen = p.states.find((st) => st.at >= s.at && st.self && st.self.x === s.x && st.self.z === s.z);
    if (seen) lat.push(seen.at - s.at);
  }
  return {
    welcomed: !!p.welcome,
    maxPlayersSeen: n.length ? Math.max(...n) : 0,
    lastPlayersSeen: n.length ? n[n.length - 1] : 0,
    states: p.states.length,
    locSent: p.sent.length,
    locToStateMs: { n: lat.length, p50: pct(lat, 50), p95: pct(lat, 95) },
    frameMs: { n: frames.length, p50: pct(frames, 50), p95: pct(frames, 95), max: pct(frames, 100) },
    closes: p.closes,
  };
};

/** The two real services' resident memory (MB) and accumulated CPU time, by pid. */
export const serverUsage = () =>
  Object.fromEntries(
    children.slice(0, 2).map((child, i) => {
      const out = spawnSync("ps", ["-o", "rss=,cputime=", "-p", String(child.pid)], { encoding: "utf8" }).stdout.trim().split(/\s+/);
      return [i === 0 ? "writer" : "presence", { rssMb: Math.round(Number(out[0]) / 1024), cpuTime: out[1] }];
    }),
  );

export const ctx = { clientlogLines, serverUsage, crossLatency, get browser() { return browser; }, set browser(b) { browser = b; }, ORIGIN, SUPABASE_HOST, CLIENTS, PLAY_SECONDS, OUT, sleep, pct, summarise, db, finish, chromium };
// The scenario (entering Westminster, walking, attacking, saving, reloading) lives in the file named by ARMA_E2E_SCENARIO so it can follow the client's own hooks.
const scenario = await import(path.resolve(env("ARMA_E2E_SCENARIO")));
// ARMA_E2E_GL=native: the machine's real GPU (a Mac: new headless Chromium over ANGLE/Metal). Otherwise software GL (SwiftShader), which is what a headless VPS has.
const native = process.env.ARMA_E2E_GL === "native";
const launch = async () =>
  (browser = await chromium.launch({
    headless: true,
    ...(process.env.ARMA_E2E_CHROMIUM ? { executablePath: process.env.ARMA_E2E_CHROMIUM } : native ? { channel: "chromium" } : {}), // a Chrome for Testing build the installed Playwright does not know

    args: ["--mute-audio", `--host-resolver-rules=MAP ${SUPABASE_HOST} 0.0.0.0`, "--ignore-gpu-blocklist", ...(native ? ["--use-angle=metal"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])],
  }));
await scenario.run({ ...ctx, newClient, launch });
