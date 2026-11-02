// Driven by e2e-local.sh. Starts a fake Supabase Auth, the real writer and presence from the release bundle, and plays two simulated phones.
// Tokens are "test.<account uuid>.<first name>"; the fake auth accepts only those. Prints "ok n - ..." per check and exits non-zero on the first failure.
import assert from "node:assert/strict";
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
  src = env("ARMA_E2E_SRC");
const AUTH = 18480,
  WRITER = 18891,
  PRESENCE = 18894,
  KEY = "e2e-local-only-internal-key";
const ALICE = "00000000-0000-4000-8000-00000000000a",
  BOB = "00000000-0000-4000-8000-00000000000b";
const token = (id, name, device = "") => `test.${id}.${name}${device}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let n = 0;
const ok = (what) => console.log(`  ok ${++n} - ${what}`);

// Supabase Auth stand-in: who does this token belong to?
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

await start("server/writer/main.js", { ARMA_WRITER: "1", WRITER_PORT: String(WRITER), DATABASE_URL: `postgres://arma_writer:e2e-local-only-writer-pw@127.0.0.1:${pgPort}/postgres` }, "writer listening");
await start(
  "server/presence/main.js",
  { ARMA_PRESENCE: "1", PRESENCE_PORT: String(PRESENCE), WRITER_URL: `http://127.0.0.1:${WRITER}`, ARMA_AREA_DATA: areaJson, PRESENCE_ORIGINS: "http://e2e.local" },
  "presence listening",
);
console.log("  writer, presence and fake auth are up (all on 127.0.0.1)");

const api = async (op, who, body = {}) => {
  const res = await fetch(`http://127.0.0.1:${WRITER}/arma/${op}`, { method: "POST", headers: { Authorization: `Bearer ${who}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const status = async (who) => {
  const res = await fetch(`http://127.0.0.1:${WRITER}/arma/status`, { headers: who ? { Authorization: `Bearer ${who}` } : {} });
  return { status: res.status, cache: res.headers.get("cache-control"), vary: res.headers.get("vary"), body: await res.json() };
};
const psql = (statement) => spawnSync("psql", ["-X", "-q", "-At", "-U", "postgres", "-d", "postgres", "-c", statement], { env: { ...process.env, PGHOST: "127.0.0.1", PGPORT: pgPort }, encoding: "utf8" }).stdout.trim();

// A bare WebSocket (the same hand-rolled client the presence tests use; Node's global one cannot set Origin).
const open = (tok) =>
  new Promise((resolve) => {
    const socket = net.connect(PRESENCE, "127.0.0.1");
    const key = randomBytes(16).toString("base64");
    let buffer = Buffer.alloc(0),
      upgraded = false,
      closeCode = null;
    const messages = [];
    const client = {
      messages,
      closed: new Promise((done) => socket.on("close", () => done(closeCode))),
      send(obj) {
        const payload = Buffer.from(JSON.stringify(obj)),
          mask = randomBytes(4);
        socket.write(Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, Buffer.from(payload.map((b, i) => b ^ mask[i & 3]))]));
      },
      async until(test, ms = 3000) {
        for (let waited = 0; waited < ms; waited += 25) {
          const found = messages.find(test);
          if (found) return found;
          await sleep(25);
        }
        throw new Error(`no matching message in ${ms} ms; got ${JSON.stringify(messages.slice(-3))}`);
      },
      last: (type) => [...messages].reverse().find((m) => m.t === type),
      get closeCode() {
        return closeCode;
      },
    };
    socket.on("error", () => {});
    socket.on("connect", () =>
      socket.write(`GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: arma.v1${tok ? `, token.${tok}` : ""}\r\nOrigin: http://e2e.local\r\n\r\n`),
    );
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const end = buffer.indexOf("\r\n\r\n");
        if (end < 0) return;
        const head = buffer.subarray(0, end).toString();
        buffer = buffer.subarray(end + 4);
        const code = Number(head.split(" ")[1]);
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
        }
        if (buffer.length < offset + length) return;
        const payload = buffer.subarray(offset, offset + length),
          opcode = buffer[0] & 15;
        buffer = buffer.subarray(offset + length);
        if (opcode === 1) messages.push(JSON.parse(payload.toString()));
        else if (opcode === 8) closeCode = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
      }
    });
  });

const aliceTok = token(ALICE, "Alice"),
  bobTok = token(BOB, "Bob");
const v18 = JSON.parse(fs.readFileSync(path.join(src, "Web/tests/fixtures/navigation203-source202-v18.json"), "utf8"));
const record = (carried, bank) => ({ ...v18, marked: { ...v18.marked, carried, bank } });

console.log("== 0. the world is open to the test accounts");
const open0 = await status(aliceTok);
assert.deepEqual(open0.body, { enabled: true, open: true, allowed: true });
assert.equal(open0.vary, "Authorization");
ok(`status with a token: ${JSON.stringify(open0.body)}, Vary: ${open0.vary}`);
const anon0 = await status();
assert.deepEqual([anon0.body, anon0.cache], [{ enabled: true, open: true }, "public, max-age=30"]);
ok(`anonymous status: ${JSON.stringify(anon0.body)}, ${anon0.cache}`);
assert.equal((await api("create_character", "test.not-a-uuid.x", { name: "x" })).status, 401);
ok("a forged token is a 401");
const aliceChar = (await api("create_character", aliceTok, { name: "Alice" })).body.character;
const bobChar = (await api("create_character", bobTok, { name: "Bob" })).body.character;
assert.ok(aliceChar && bobChar && aliceChar !== bobChar);
ok(`characters created: alice ${aliceChar}, bob ${bobChar}`);

console.log("== 1. two clients meet in Westminster");
const a = await open(aliceTok),
  b = await open(bobTok);
assert.ok(a.send && b.send, `both upgrade (alice ${a.status}, bob ${b.status})`);
a.send({ t: "join", area: "westminster" });
b.send({ t: "join", area: "westminster" });
const wa = await a.until((m) => m.t === "welcome"),
  wb = await b.until((m) => m.t === "welcome");
assert.deepEqual([wa.area, wb.area], ["westminster", "westminster"]);
ok(`welcome in westminster: alice ${wa.name} at (${wa.x}, ${wa.z}), bob ${wb.name} at (${wb.x}, ${wb.z})`);
const sees = (client, id) => client.until((m) => m.t === "state" && m.players.some((p) => p.id === id));
await sees(a, wb.id);
await sees(b, wa.id);
ok("each sees the other in the state broadcast");
await sleep(300);
const step = { x: wb.x + 25, z: wb.z };
b.send({ t: "loc", ...step });
const moved = await a.until((m) => m.t === "state" && m.players.some((p) => p.id === wb.id && p.x === step.x && p.z === step.z));
ok(`bob moves 25 cm and alice sees it at (${step.x}, ${step.z}) in tick ${moved.tick}`);

console.log("== 2. save, reload, load_run");
const rec1 = record(0, 0);
const saved = await api("save_run", aliceTok, { character: aliceChar, era: 18, record: rec1, revision: 0, seq: 1 });
assert.equal(saved.status, 200);
assert.equal(saved.body.revision, 1);
const loaded = await api("load_run", aliceTok, { character: aliceChar });
assert.deepEqual(loaded.body.run.record, rec1);
ok(`save_run revision ${saved.body.revision}; load_run returns the same record (era ${loaded.body.run.era ?? 18})`);

console.log("== 3. a second device of the same account joins the same character");
const device2 = token(ALICE, "Alice", "Phone2");
const active = await api("active", device2);
assert.deepEqual(active.body, { character: aliceChar });
const count = psql(`select count(*) from public.arma_characters where account = '${ALICE}'`);
assert.equal(count, "1");
ok(`device 2 gets active = ${active.body.character}; the account still has ${count} character`);
const reload = await api("load_run", device2, { character: aliceChar });
assert.deepEqual(reload.body.run.record, rec1);
ok("device 2 loads the same record");

console.log("== 4. forged cash is clamped by the server");
const forged = await api("save_run", aliceTok, { character: aliceChar, era: 18, record: record(1_000_000, 1_000_000), revision: 1, seq: 2 });
assert.equal(forged.status, 200);
assert.equal(forged.body.clamped, true);
const after = await api("load_run", aliceTok, { character: aliceChar });
assert.deepEqual([after.body.run.record.marked.carried, after.body.run.record.marked.bank], [0, 0]);
ok(`save claiming 1,000,000 carried + 1,000,000 bank: clamped=${forged.body.clamped}, stored carried/bank = 0/0 (nothing was earned)`);

console.log("== 5. the world switch OFF");
psql("update public.arma_config set value = 'false'::jsonb where key = 'arma_enabled'");
await sleep(5500); // the anonymous status is memoised in the writer for 5 s
const closedAnon = await status();
assert.equal(closedAnon.body.enabled, false);
const closedMine = await status(aliceTok);
assert.deepEqual([closedMine.body.enabled, closedMine.body.allowed], [false, false]);
ok(`status closed: anonymous ${JSON.stringify(closedAnon.body)}, alice ${JSON.stringify(closedMine.body)}`);
const refused = await open(bobTok);
assert.ok(refused.send, "a verified account is accepted, then closed");
assert.equal(await Promise.race([refused.closed, sleep(3000).then(() => "timeout")]), 4003);
ok("a new connection from a verified account closes with 4003 and is never admitted");
const noToken = await open(null);
assert.equal(noToken.status, 401);
ok("a connection with no token is refused before the upgrade (HTTP 401)");
const halted = await api("save_run", aliceTok, { character: aliceChar, era: 18, record: record(0, 0), revision: 1, seq: 3 });
assert.notEqual(halted.status, 200, JSON.stringify(halted));
ok(`save_run while closed: HTTP ${halted.status} ${JSON.stringify(halted.body)}`);
const loadClosed = await api("load_run", aliceTok, { character: aliceChar });
ok(`load_run while closed: HTTP ${loadClosed.status} ${JSON.stringify(loadClosed.body)}`);
const stored = psql(`select revision from public.arma_runs where character = '${aliceChar}'`);
assert.equal(stored, "2", "the halted save wrote nothing");
ok("the database still holds revision 2: the halted save wrote nothing");

console.log(`ALL ${n} CHECKS PASS`);
finish(0);
