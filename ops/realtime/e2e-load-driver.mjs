// Driven by e2e-local.sh (ARMA_E2E_DRIVER=e2e-load-driver.mjs ARMA_E2E_BOTS=N [ARMA_E2E_SECONDS=20]): N bots against the real writer and presence on a LOCAL
// Postgres. Each bot signs up a character, joins Westminster, walks (a loc every 200 ms), and saves every 3 s. Reports latency percentiles, message counts,
// refusals and the services' memory/CPU so the limits show up here before real traffic finds them. Same fake auth and ws client as e2e-driver.mjs.
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const env = (name) => process.env[name] ?? (() => { throw new Error(`set ${name}`); })();
const bundle = env("ARMA_E2E_BUNDLE"),
  pgPort = env("ARMA_E2E_PG_PORT"),
  areaJson = env("ARMA_E2E_AREA"),
  src = env("ARMA_E2E_SRC"),
  BOTS = Number(env("ARMA_E2E_BOTS")),
  SECONDS = Number(process.env.ARMA_E2E_SECONDS ?? 20);
if (!(BOTS >= 1)) throw new Error("ARMA_E2E_BOTS must be 1 or more");
const AUTH = 18480,
  WRITER = 18891,
  PRESENCE = 18894,
  KEY = "e2e-local-only-internal-key";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const account = (i) => `00000000-0000-4000-8000-${(256 + i).toString(16).padStart(12, "0")}`; // matches e2e-local.sh: 0x100 + i, i from 0
const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : NaN);

const auth = http.createServer((req, res) => {
  const m = /^Bearer test\.([0-9a-f-]{36})\.(\w+)$/.exec(req.headers.authorization ?? "");
  res.writeHead(m ? 200 : 401, { "Content-Type": "application/json" });
  res.end(JSON.stringify(m ? { id: m[1], user_metadata: { full_name: m[2] } } : { error: "bad token" }));
});
await new Promise((resolve) => auth.listen(AUTH, "127.0.0.1", resolve));
const children = [];
const start = (script, extra, ready) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(bundle, script)], {
      cwd: bundle,
      env: { PATH: process.env.PATH, SUPABASE_URL: `http://127.0.0.1:${AUTH}`, SUPABASE_ANON_KEY: "e2e-local-only", ARMA_INTERNAL_KEY: KEY, ...extra },
    });
    children.push(child);
    let out = "";
    const watch = (chunk) => {
      out += chunk;
      if (out.includes(ready)) resolve(child);
    };
    child.stdout.on("data", watch);
    child.stderr.on("data", watch);
    child.on("exit", (code) => reject(new Error(`${script} exited ${code}: ${out}`)));
    setTimeout(() => reject(new Error(`${script} did not start: ${out}`)), 15000);
  });
const finish = (code) => {
  for (const child of children) child.removeAllListeners("exit"), child.kill();
  auth.close();
  setTimeout(() => process.exit(code), 200);
};
process.on("uncaughtException", (error) => (console.error(`FAIL - ${error.stack ?? error}`), finish(1)));
process.on("unhandledRejection", (error) => (console.error(`FAIL - ${error?.stack ?? error}`), finish(1)));

const writer = await start("server/writer/main.js", { ARMA_WRITER: "1", WRITER_PORT: String(WRITER), DATABASE_URL: `postgres://arma_writer:e2e-local-only-writer-pw@127.0.0.1:${pgPort}/postgres` }, "writer listening");
const presence = await start("server/presence/main.js", { ARMA_PRESENCE: "1", PRESENCE_PORT: String(PRESENCE), WRITER_URL: `http://127.0.0.1:${WRITER}`, ARMA_AREA_DATA: areaJson, PRESENCE_ORIGINS: "http://e2e.local" }, "presence listening");
const usage = (child) => {
  const out = spawnSync("ps", ["-o", "rss=,cputime=", "-p", String(child.pid)], { encoding: "utf8" }).stdout.trim().split(/\s+/);
  return { rssMb: Math.round(Number(out[0]) / 1024), cpu: out[1] };
};

const stats = { create: [], welcome: [], save: [], loc: [], connectFail: 0, closed: [], saveCodes: {}, states: 0, refuses: [], bytes: 0 };
const api = async (op, token, body) => {
  const t0 = performance.now();
  const res = await fetch(`http://127.0.0.1:${WRITER}/arma/${op}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null), ms: performance.now() - t0 };
};

const open = (tok, onMessage, onClose) =>
  new Promise((resolve) => {
    const socket = net.connect(PRESENCE, "127.0.0.1");
    const key = randomBytes(16).toString("base64");
    let buffer = Buffer.alloc(0),
      upgraded = false;
    const client = {
      socket,
      send(obj) {
        const payload = Buffer.from(JSON.stringify(obj)),
          mask = randomBytes(4);
        socket.write(Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, Buffer.from(payload.map((b, i) => b ^ mask[i & 3]))]));
      },
    };
    socket.on("error", () => {});
    socket.on("connect", () =>
      socket.write(`GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: arma.v1, token.${tok}\r\nOrigin: http://e2e.local\r\n\r\n`),
    );
    socket.on("data", (chunk) => {
      stats.bytes += chunk.length;
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const end = buffer.indexOf("\r\n\r\n");
        if (end < 0) return;
        const code = Number(buffer.subarray(0, end).toString().split(" ")[1]);
        buffer = buffer.subarray(end + 4);
        if (code !== 101) return resolve({ status: code });
        upgraded = true;
        resolve(client);
      }
      for (;;) {
        if (buffer.length < 2) return;
        let length = buffer[1] & 0x7f,
          offset = 2;
        if (length === 126) {
          if (buffer.length < 4) return;
          length = buffer.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) return socket.destroy();
        if (buffer.length < offset + length) return;
        const payload = buffer.subarray(offset, offset + length),
          opcode = buffer[0] & 15;
        buffer = buffer.subarray(offset + length);
        if (opcode === 1) onMessage(JSON.parse(payload.toString()));
        else if (opcode === 8) onClose(payload.length >= 2 ? payload.readUInt16BE(0) : 1005);
      }
    });
    socket.on("close", () => onClose(null));
  });

const bots = [];
let running = true;
async function bot(i) {
  const id = account(i),
    tok = `test.${id}.Bot${i}`;
  const created = await api("create_character", tok, { name: `Bot${i}` });
  stats.create.push(created.ms);
  if (created.status !== 200) throw new Error(`bot ${i}: create_character ${created.status} ${JSON.stringify(created.body)}`);
  const character = created.body.character;
  const me = { i, id: null, x: 0, z: 0, pending: new Map(), done: false };
  const t0 = performance.now();
  const client = await open(
    tok,
    (m) => {
      if (m.t === "welcome") {
        me.id = m.id;
        me.x = m.x;
        me.z = m.z;
        me.base = m.x;
        stats.welcome.push(performance.now() - t0);
        me.welcomed = true;
      } else if (m.t === "state") {
        stats.states++;
        const self = m.players.find((p) => p.id === me.id);
        if (self && me.pending.has(self.x)) (stats.loc.push(performance.now() - me.pending.get(self.x)), me.pending.delete(self.x));
        me.seen = m.players.length;
      } else if (m.t === "refuse") stats.refuses.push(m.reason);
    },
    (code) => running && !me.done && stats.closed.push(`bot ${i} closed ${code}`),
  );
  if (!client.send) return void stats.connectFail++;
  client.send({ t: "join", area: "westminster" });
  for (let waited = 0; !me.welcomed && waited < 5000; waited += 25) await sleep(25);
  if (!me.welcomed) return void stats.connectFail++;
  bots.push(me);
  let revision = 0,
    seq = 0,
    flip = 0;
  const v18 = JSON.parse(fs.readFileSync(path.join(src, "Web/tests/fixtures/navigation203-source202-v18.json"), "utf8"));
  const walk = setInterval(() => {
    const x = me.base + (flip++ % 2 ? 0 : 40);
    me.pending.set(x, performance.now());
    client.send({ t: "loc", x, z: me.z });
  }, 200);
  const saver = (async () => {
    while (running) {
      await sleep(3000);
      if (!running) break;
      const r = await api("save_run", tok, { character, era: 18, record: { ...v18, marked: { ...v18.marked, carried: 0, bank: 0 } }, revision, seq: ++seq });
      stats.save.push(r.ms);
      stats.saveCodes[r.status] = (stats.saveCodes[r.status] ?? 0) + 1;
      if (r.status === 200 && r.body?.revision) revision = r.body.revision;
    }
  })();
  me.stop = async () => {
    me.done = true;
    clearInterval(walk);
    await saver;
    client.socket.destroy();
  };
}

console.log(`== ${BOTS} bots for ${SECONDS}s against the local stack`);
const before = { writer: usage(writer), presence: usage(presence) };
const t0 = performance.now();
await Promise.all(Array.from({ length: BOTS }, (_, i) => bot(i)));
console.log(`  signed up and joined: ${bots.length}/${BOTS} in ${((performance.now() - t0) / 1000).toFixed(1)} s (connect failures ${stats.connectFail})`);
await sleep(SECONDS * 1000);
running = false;
await Promise.all(bots.map((b) => b.stop()));
const health = await (await fetch(`http://127.0.0.1:${WRITER}/health`)).json();
const f = (xs, p) => `${pct(xs, p).toFixed(0)} ms`;
console.log(`  create_character   n=${stats.create.length}  p50 ${f(stats.create, 50)}  p95 ${f(stats.create, 95)}  max ${f(stats.create, 100)}`);
console.log(`  join -> welcome    n=${stats.welcome.length}  p50 ${f(stats.welcome, 50)}  p95 ${f(stats.welcome, 95)}  max ${f(stats.welcome, 100)}`);
console.log(`  loc -> own state   n=${stats.loc.length}  p50 ${f(stats.loc, 50)}  p95 ${f(stats.loc, 95)}  max ${f(stats.loc, 100)}`);
console.log(`  save_run           n=${stats.save.length}  p50 ${f(stats.save, 50)}  p95 ${f(stats.save, 95)}  max ${f(stats.save, 100)}  codes ${JSON.stringify(stats.saveCodes)}`);
console.log(`  state messages ${stats.states} (${(stats.states / SECONDS / Math.max(1, bots.length)).toFixed(1)}/s per bot), ${(stats.bytes / 1024 / SECONDS).toFixed(0)} KiB/s into the bots, refusals ${stats.refuses.length}${stats.refuses.length ? " " + JSON.stringify([...new Set(stats.refuses)]) : ""}`);
console.log(`  unexpected closes ${stats.closed.length}${stats.closed.length ? ": " + stats.closed.slice(0, 5).join("; ") : ""}`);
console.log(`  writer counters ${JSON.stringify(health)}`);
console.log(`  writer   before ${JSON.stringify(before.writer)} after ${JSON.stringify(usage(writer))}`);
console.log(`  presence before ${JSON.stringify(before.presence)} after ${JSON.stringify(usage(presence))}`);
const bad = stats.connectFail + stats.closed.length + (stats.saveCodes[200] ? 0 : 1);
console.log(bad ? `RESULT: ${bad} problem(s) above` : "RESULT: no failures");
finish(bad ? 1 : 0);
