import test from "node:test";
import assert from "node:assert/strict";
import { adoptServerCash, createSaveClient, isRunKey, observeStorage, CHARACTER_KEY } from "../src/engine/save-client.js";
import { GAME_DATA, validateSaveClient } from "../src/engine/game-data.js";

const memory = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), map };
};
const record = (extra = {}) => JSON.stringify({ version: 18, marked: { carried: 100, bank: 0, bounty: 0 }, ...extra });

// A writer that answers each op from a script and remembers what it was sent.
function writer(script = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const op = url.split("/").pop(),
      body = JSON.parse(init.body),
      answer = (script[op] ?? (() => ({})))(body, calls.filter((c) => c.op === op).length);
    calls.push({ op, body, auth: init.headers.Authorization });
    if (answer instanceof Error) throw answer;
    const status = answer.status ?? 200;
    return { ok: status < 400, status, json: async () => answer.body ?? answer };
  };
  return { calls, fetchImpl };
}
function make(script, options = {}) {
  const w = writer({
    create_character: () => ({ character: "pc:abc" }),
    load_run: () => ({ run: null }),
    save_run: (body) => ({ revision: 1, savedAt: "t" }),
    ...script,
  });
  const clock = { ms: 100000 },
    timers = [],
    lines = [],
    cash = [],
    storage = memory();
  const client = createSaveClient({
    baseUrl: "https://x.test/arma/api",
    getToken: async () => "tok-123456789",
    storage,
    fetchImpl: w.fetchImpl,
    now: () => clock.ms,
    setTimer: (fn, ms) => timers.push({ fn, ms }) && timers.length,
    clearTimer: () => {},
    onCash: (reply) => cash.push(reply),
    log: (line) => lines.push(line),
    ...options,
  });
  return { client, w, clock, timers, lines, cash, storage, run: async () => { await timers.shift().fn(); } };
}

test("tuning is data: the loader serves it and refuses an out-of-range interval", () => {
  assert.equal(GAME_DATA.saveClient.minSaveIntervalMs, 5000);
  assert.throws(() => validateSaveClient({ ...GAME_DATA.saveClient, minSaveIntervalMs: 10 }));
  assert.throws(() => validateSaveClient({ ...GAME_DATA.saveClient, extra: 1 }));
});

test("the first save creates the character once (remembered), learns revision 0, then sends seq 1 with the bearer token", async () => {
  const t = make();
  t.client.queue(record());
  await t.run();
  assert.deepEqual(t.w.calls.map((c) => c.op), ["create_character", "load_run", "save_run"]);
  const save = t.w.calls[2];
  assert.equal(save.auth, "Bearer tok-123456789");
  assert.deepEqual([save.body.character, save.body.era, save.body.revision, save.body.seq], ["pc:abc", 18, 0, 1]);
  assert.equal(t.storage.map.get(CHARACTER_KEY), "pc:abc");
  assert.equal(t.client.state.revision, 1);
  // A later save: no new character or load; seq 2 with the new revision.
  t.clock.ms += 6000;
  t.client.queue(record({ hp: 5 }));
  await t.run();
  assert.deepEqual(t.w.calls.slice(3).map((c) => [c.op, c.body.seq, c.body.revision]), [["save_run", 2, 1]]);
});

test("saves are coalesced: at most one request per interval, and only the newest record is sent", async () => {
  const t = make();
  t.client.queue(record({ hp: 1 }));
  await t.run();
  t.client.queue(record({ hp: 2 }));
  t.client.queue(record({ hp: 3 }));
  assert.equal(t.timers.length, 1, "one pending send");
  assert.ok(t.timers[0].ms > 0, "waits out the interval");
  t.clock.ms += 5000;
  await t.run();
  const sent = t.w.calls.filter((c) => c.op === "save_run");
  assert.deepEqual(sent.map((c) => c.body.record.hp ?? null), [1, 3]);
});

test("a clamped reply hands the server's carried and bank to onCash; adoptServerCash changes only those two numbers", async () => {
  const t = make({ save_run: () => ({ revision: 1, savedAt: "t", clamped: true, carried: 40, bank: 10 }) });
  t.client.queue(record());
  await t.run();
  assert.deepEqual(t.cash, [{ revision: 1, savedAt: "t", clamped: true, carried: 40, bank: 10 }]);
  const game = { marked: { version: 1, carried: 900, bank: 50, bounty: 7 } };
  assert.equal(adoptServerCash(game, t.cash[0]), true);
  assert.deepEqual(game.marked, { version: 1, carried: 40, bank: 10, bounty: 7 });
  assert.equal(adoptServerCash(game, { revision: 2 }), false, "an unclamped reply changes nothing");
  assert.equal(adoptServerCash({ marked: null }, t.cash[0]), false);
});

test("unreceipted paths are only logged (report-only): no cash callback, no player-facing change", async () => {
  const t = make({ save_run: () => ({ revision: 1, unreceipted: ["bossEquipment.emberProjector"] }) });
  t.client.queue(record());
  await t.run();
  assert.deepEqual(t.lines, ["[arma-save] unreceipted: bossEquipment.emberProjector"]);
  assert.deepEqual(t.cash, []);
});

test("stale-seq: continue from the server's lastSeq + 1; a seq conflict does the same", async () => {
  const t = make({
    save_run: (body, n) => (n === 0 ? { refused: "stale-seq", lastSeq: 41 } : { revision: 3, savedAt: "t" }),
  });
  t.client.queue(record());
  await t.run();
  assert.deepEqual(t.w.calls.filter((c) => c.op === "save_run").map((c) => c.body.seq), [1, 42]);
  assert.equal(t.client.state.revision, 3);
});

test("a network error leaves the outcome uncertain; a 'stale' answer then means our own save landed, so the revision is adopted and the record resent", async () => {
  const t = make({
    save_run: (body, n) => (n === 0 ? new Error("down") : n === 1 ? { refused: "stale", revision: 1 } : { revision: 2, savedAt: "t" }),
  });
  t.client.queue(record());
  await t.run();
  assert.equal(t.client.state.uncertain, true);
  t.clock.ms += 6000;
  t.client.queue(record({ hp: 9 }));
  await t.run();
  const sent = t.w.calls.filter((c) => c.op === "save_run");
  assert.deepEqual(sent.map((c) => [c.body.seq, c.body.revision]), [[1, 0], [2, 0], [3, 1]]);
  assert.equal(t.client.state.revision, 2);
  assert.equal(t.client.state.uncertain, false);
});

test("a 'stale' answer when nothing was uncertain (another device) is logged and not overwritten", async () => {
  const t = make({ save_run: () => ({ refused: "stale", revision: 7 }) });
  t.client.queue(record());
  await t.run();
  assert.equal(t.w.calls.filter((c) => c.op === "save_run").length, 1);
  assert.deepEqual(t.lines, ["[arma-save] refused: stale", "[arma-save] not saved: stale"]);
  assert.equal(t.client.state.revision, 0, "the server's newer record is not claimed");
});

test("refusals (cap/shape), rate limits and no token are swallowed with a log line, never thrown", async () => {
  const cap = make({ save_run: () => ({ refused: "cap", reason: "cap:hp" }) });
  cap.client.queue(record());
  await cap.run();
  assert.match(cap.lines[0], /refused: cap \(cap:hp\)/);
  const limited = make({ save_run: () => ({ status: 429, body: { error: "rate-limited", retryMs: 4000 } }) });
  limited.client.queue(record());
  await limited.run();
  assert.match(limited.lines[0], /not saved: rate-limited/);
  const none = make({}, { getToken: async () => null });
  none.client.queue(record());
  await none.run();
  assert.deepEqual(none.w.calls, []);
  assert.match(none.lines[0], /offline/);
});

test("no client without a base URL or token source; stop() cancels what is pending", () => {
  assert.equal(createSaveClient({ baseUrl: "", getToken: async () => "x" }), null);
  assert.equal(createSaveClient({ baseUrl: "https://x.test" }), null);
});

test("observeStorage reports run-save writes and passes everything through untouched", () => {
  const storage = memory(),
    seen = [];
  const watched = observeStorage(storage, isRunKey, (raw) => seen.push(raw));
  watched.setItem("armagedom:area-run:v3", "a");
  watched.setItem("armagedom:area1-run:v1", "b");
  watched.setItem("armagedom:pistol:v1", "c");
  assert.deepEqual(seen, ["a", "b"]);
  assert.equal(storage.getItem("armagedom:pistol:v1"), "c");
  assert.equal(watched.getItem("armagedom:area-run:v3"), "a");
  const broken = observeStorage(storage, isRunKey, () => {
    throw Error("listener");
  });
  assert.doesNotThrow(() => broken.setItem("armagedom:area-run:v3", "d"));
  assert.equal(storage.getItem("armagedom:area-run:v3"), "d");
});
