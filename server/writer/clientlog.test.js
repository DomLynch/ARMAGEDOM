// node --test server/writer/clientlog.test.js: the beacon route over a real socket with a database stub that throws if it is ever touched.
import test from "node:test";
import assert from "node:assert/strict";
import { cleanClientLog, ipLimiter, scrub } from "./clientlog.js";
import { createWriter } from "./writer.js";

const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const event = (over = {}) => ({ kind: "error", code: "boot.fail", message: "x", n: 1, ...over });

async function start(over = {}) {
  const lines = [];
  let clock = 1_000_000;
  const db = { query: async () => { throw new Error("the beacon must never touch the database"); } };
  const writer = createWriter({ db, verify: async () => { throw new Error("the beacon must never verify a token"); }, spawnRows: () => null, internalKey: "k", log: (l) => lines.push(l), now: () => clock, ...over });
  await new Promise((resolve) => writer.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${writer.server.address().port}`;
  const post = (body, headers = {}, raw) => fetch(`${base}/arma/clientlog`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: raw ?? JSON.stringify(body) });
  return { lines, post, base, tick: (ms) => (clock += ms), close: () => new Promise((resolve) => writer.server.close(resolve)) };
}

test("scrub removes tokens, emails, uuids, queries and long opaque runs, and flattens control characters", () => {
  const dirty = `fail ${JWT} for me@example.com acct 00000000-0000-4000-8000-00000000000a at /play?access_token=abc&x=1 key ${"A1b2".repeat(8)}\nnext\u0000line access_token=zzz Bearer qqq`;
  const clean = scrub(dirty);
  for (const secret of [JWT, "eyJ", "me@example.com", "00000000-0000-4000", "access_token", "A1b2A1b2", "zzz", "qqq", "\n", "\u0000"]) assert.ok(!clean.includes(secret), `still has ${secret}`);
  assert.match(clean, /^fail /);
});

test("cleanClientLog enforces the schema and the length limits, and drops unknown fields", () => {
  assert.equal(cleanClientLog(null), null);
  assert.equal(cleanClientLog({ v: 2, events: [event()] }), null, "version");
  assert.equal(cleanClientLog({ v: 1, events: [] }), null, "no events");
  assert.equal(cleanClientLog({ v: 1, events: [event({ kind: "other" })] }), null, "unknown kind only");
  const out = cleanClientLog({
    v: 1,
    release: "a".repeat(40) + "/../ bad!",
    area: "westminster<script>",
    extra: "dropped",
    events: [event({ code: "c".repeat(100), message: "word ".repeat(100), n: 99999, secret: "dropped" }), ...Array.from({ length: 20 }, () => event())],
  });
  assert.equal(out.events.length, 10, "at most 10 events");
  assert.ok(out.release.length <= 80 && /^[A-Za-z0-9._/:-]+$/.test(out.release) && out.release.startsWith("a".repeat(40)), "a commit sha survives, junk characters do not");
  assert.equal(out.area, "westminster_script_");
  assert.deepEqual([out.events[0].code.length, out.events[0].message.length, out.events[0].n], [40, 200, 1000]);
  assert.deepEqual(Object.keys(out.events[0]), ["kind", "code", "message", "n"]);
  assert.ok(!JSON.stringify(out).includes("dropped"));
});

test("session is a charset-limited id of at most 24 characters, 'none' when missing, and is kept on the cleaned body", () => {
  assert.equal(cleanClientLog({ v: 1, session: "0123456789ab", events: [event()] }).session, "0123456789ab");
  assert.equal(cleanClientLog({ v: 1, events: [event()] }).session, "none");
  const long = cleanClientLog({ v: 1, session: "x".repeat(60) + "<b>", events: [event()] }).session;
  assert.equal(long, "x".repeat(24));
  assert.ok(!cleanClientLog({ v: 1, session: "me@example.com", events: [event()] }).session.includes("@"), "an email is scrubbed like any other id");
});

test("release, area and code are scrubbed of structured secrets too, but a 40-char commit sha survives", () => {
  const out = cleanClientLog({ v: 1, release: `${JWT}`, area: "me@example.com", events: [event({ code: "Bearer abc", message: "ok" })] });
  const text = JSON.stringify(out);
  for (const secret of ["eyJ", "example.com", "Bearer", "abc"]) assert.ok(!text.includes(secret), `still has ${secret}`);
  assert.equal(cleanClientLog({ v: 1, release: "0123456789abcdef0123456789abcdef01234567", events: [event()] }).release, "0123456789abcdef0123456789abcdef01234567");
});

test("ipLimiter: a burst, then one per refill, per IP, and the table stays bounded", () => {
  let t = 0;
  const allow = ipLimiter({ burst: 3, refillMs: 10_000 }, () => t);
  assert.deepEqual([1, 2, 3, 4].map(() => allow("1.1.1.1")), [true, true, true, false]);
  assert.equal(allow("2.2.2.2"), true, "another IP has its own bucket");
  t += 10_000;
  assert.deepEqual([allow("1.1.1.1"), allow("1.1.1.1")], [true, false]);
  for (let i = 0; i < 20_000; i++) assert.equal(allow(`10.0.${i >> 8}.${i & 255}`), true); // a flood of new IPs neither throws nor grows the table without bound (MAX_IPS)
});

test("POST /arma/clientlog: 204 and one journal line per event, no token needed, secrets scrubbed, database and verify untouched", async () => {
  const t = await start();
  try {
    const res = await t.post({ v: 1, release: "abc1234", area: "westminster", session: "a1b2c3d4e5f6", events: [event({ message: `boot failed ${JWT} ${"user@example.com"}` }), event({ kind: "presence", code: "ws.4003", message: "closed", n: 2 })] }, { "X-Real-IP": "203.0.113.9", Authorization: "Bearer should-be-ignored" });
    assert.equal(res.status, 204);
    assert.equal(t.lines.length, 2);
    assert.ok(t.lines.every((l) => l.startsWith("clientlog {")));
    const first = JSON.parse(t.lines[0].slice("clientlog ".length));
    assert.deepEqual([first.release, first.area, first.kind, first.code], ["abc1234", "westminster", "error", "boot.fail"]);
    assert.equal(first.session, "a1b2c3d4e5f6", "the page-load id is journaled on every line");
    assert.ok(!t.lines.join("\n").includes("eyJ") && !t.lines.join("\n").includes("example.com") && !t.lines.join("\n").includes("should-be-ignored"));
  } finally {
    await t.close();
  }
});

test("POST /arma/clientlog refuses bad bodies and is limited per IP, not per account", async () => {
  const t = await start();
  try {
    const ip = { "X-Real-IP": "198.51.100.7" };
    assert.equal((await t.post(null, ip, "not json")).status, 400);
    assert.equal((await t.post({ v: 1, events: [] }, ip)).status, 400);
    assert.equal((await t.post({ v: 1, events: [event({ message: "x".repeat(5000) })] }, ip)).status, 413, "over 4 KB");
    assert.equal((await t.post({ v: 1, events: [event()] }, ip)).status, 429, "refused bodies spend the IP's burst too");
  } finally {
    await t.close();
  }
});

test("rate limit: burst 3 per IP then 429, a different IP is unaffected, and a refill reopens it", async () => {
  const t = await start();
  try {
    const body = { v: 1, events: [event()] };
    const a = { "X-Real-IP": "192.0.2.1" };
    assert.deepEqual([(await t.post(body, a)).status, (await t.post(body, a)).status, (await t.post(body, a)).status], [204, 204, 204]);
    const limited = await t.post(body, a);
    assert.equal(limited.status, 429);
    assert.equal((await t.post(body, { "X-Real-IP": "192.0.2.2" })).status, 204);
    assert.equal((await t.post(body, { "X-Real-IP": "not-an-ip" })).status, 204, "a bad header shares the 'unknown' bucket");
    t.tick(10_000);
    assert.equal((await t.post(body, a)).status, 204);
    assert.equal(t.lines.length, 6);
  } finally {
    await t.close();
  }
});

test("unknown routes are 404 for any method; a known route with the wrong method is 405", async () => {
  const t = await start();
  try {
    for (const [method, path, status] of [["GET", "/arma/api/health", 404], ["GET", "/arma/internal/x", 404], ["GET", "/arma/clientlog", 404], ["GET", "/arma/save_run", 405], ["PUT", "/internal/hits", 405], ["POST", "/arma/nonsense", 404]]) {
      const res = await fetch(t.base + path, { method });
      assert.equal(res.status, status, `${method} ${path}`);
    }
  } finally {
    await t.close();
  }
});
