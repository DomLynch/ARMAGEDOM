import test from "node:test";
import assert from "node:assert/strict";
import {
  accountOf,
  adoptServerCash,
  characterKey,
  createSaveClient,
  isRunKey,
  observeStorage,
  syncedKey,
} from "../src/engine/save-client.js";
import { CURRENT_ERA } from "../src/engine/save-eras.js";
import { MARKED_SAVE_KEY } from "../src/engine/marked-core.js";
import { make as makeRun } from "./helpers/marked-fixture.js";
import { GAME_DATA, validateSaveClient } from "../src/engine/game-data.js";

const memory = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), map };
};
// A token shaped like Supabase's: header.payload.signature, with the account in `sub`. Only the payload is read.
const jwt = (sub) => `h.${btoa(JSON.stringify({ sub })).replace(/=+$/, "")}.s`;
const record = (extra = {}) => JSON.stringify({ version: 18, marked: { carried: 100, bank: 0, bounty: 0 }, ...extra });

// A writer that answers each op from a script and remembers what it was sent.
function writer(script = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const op = url.split("/").pop(),
      body = JSON.parse(init.body),
      n = calls.filter((c) => c.op === op).length;
    calls.push({ op, body, auth: init.headers.Authorization });
    const answer = await (script[op] ?? (() => ({})))(body, n);
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
    getToken: async () => jwt("user-1"),
    storage,
    fetchImpl: w.fetchImpl,
    now: () => clock.ms,
    setTimer: (fn, ms) => timers.push({ fn, ms }) && timers.length,
    clearTimer: () => {},
    onCash: (reply, info) => cash.push({ reply, info }),
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
  assert.equal(save.auth, `Bearer ${jwt("user-1")}`);
  assert.deepEqual([save.body.character, save.body.era, save.body.revision, save.body.seq], ["pc:abc", 18, 0, 1]);
  assert.equal(t.storage.map.get(characterKey("user-1")), "pc:abc");
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

test("a clamped reply hands onCash the reply, the run the record came from and the cash that was sent", async () => {
  const t = make({ save_run: () => ({ revision: 1, savedAt: "t", clamped: true, carried: 40, bank: 10 }) }),
    run = { marked: { carried: 100, bank: 0 } };
  t.client.queue(record({ marked: { carried: 90, bank: 30, bounty: 0 } }), run);
  await t.run();
  assert.equal(t.cash.length, 1);
  assert.deepEqual(t.cash[0].reply, { revision: 1, savedAt: "t", clamped: true, carried: 40, bank: 10 });
  assert.equal(t.cash[0].info.run, run);
  assert.deepEqual(t.cash[0].info.sent, { carried: 90, bank: 30 });
});

test("adoptServerCash applies only the clamp DROP: a spend made after the record was built is not refunded", () => {
  const reply = { clamped: true, carried: 40, bank: 10 },
    sent = { carried: 90, bank: 30 }; // the server took 50 from carried and 20 from the bank
  const run = { marked: { version: 1, carried: 70, bank: 30, bounty: 7 } }; // the player spent 20 from carried since
  assert.equal(adoptServerCash(run, reply, { run, sent }), true);
  assert.deepEqual(run.marked, { version: 1, carried: 20, bank: 10, bounty: 7 }, "70-50 and 30-20, not the server's 40 and 10");
  const poor = { marked: { carried: 10, bank: 0, bounty: 0 } };
  adoptServerCash(poor, reply, { run: poor, sent });
  assert.deepEqual(poor.marked, { carried: 0, bank: 0, bounty: 0 }, "never below zero");
});

test("adoptServerCash never touches a run other than the one that produced the record, or a reply that is not a clamp", () => {
  const reply = { clamped: true, carried: 40, bank: 10 },
    sent = { carried: 90, bank: 30 },
    old = { marked: { carried: 90, bank: 30 } },
    fresh = { marked: { carried: 500, bank: 0 } }; // a new run after Retry or Reset
  assert.equal(adoptServerCash(fresh, reply, { run: old, sent }), false);
  assert.deepEqual(fresh.marked, { carried: 500, bank: 0 });
  assert.equal(adoptServerCash(fresh, reply), false, "no run identity: skipped");
  assert.equal(adoptServerCash(old, { revision: 2 }, { run: old, sent }), false, "an unclamped reply changes nothing");
  assert.equal(adoptServerCash({ marked: null }, reply, { run: null, sent }), false);
  assert.deepEqual(old.marked, { carried: 90, bank: 30 });
});

test("the cached character is keyed by account: a new guest session gets its own instead of being refused forever", async () => {
  let token = jwt("guest-A");
  const t = make({}, { getToken: async () => token });
  t.client.queue(record());
  await t.run();
  assert.equal(t.storage.map.get(characterKey("guest-A")), "pc:abc");
  assert.equal(t.w.calls.filter((c) => c.op === "create_character").length, 1);
  token = jwt("guest-B"); // the session changed (cleared storage, new device, a new guest)
  t.clock.ms += 6000;
  t.client.queue(record({ hp: 3 }));
  await t.run();
  const ops = t.w.calls.map((c) => c.op);
  assert.equal(ops.filter((o) => o === "create_character").length, 2, "guest B is not sent guest A's character");
  assert.equal(t.client.state.seq, 1, "the sequence starts again for the new character");
  assert.equal(t.w.calls.at(-1).body.revision, 0, "a new character starts from the server's revision 0, not A's");
  assert.ok(t.storage.map.get(characterKey("guest-B")));
  // Back to A: its cached id is used, nothing is created.
  token = jwt("guest-A");
  t.clock.ms += 6000;
  t.client.queue(record({ hp: 4 }));
  await t.run();
  assert.equal(t.w.calls.filter((c) => c.op === "create_character").length, 2);
});

test("an O0007 refusal (world switched off / not allow-listed) is only logged: the character id, revision and sequence are kept", async () => {
  const t = make({ save_run: (body, n) => (n === 0 ? { status: 403, body: { error: "O0007" } } : { revision: 1, savedAt: "t" }) });
  t.client.queue(record());
  await t.run();
  assert.match(t.lines[0], /not saved: O0007/);
  assert.equal(t.storage.map.get(characterKey("user-1")), "pc:abc", "the cache is NOT cleared");
  assert.equal(t.client.halted, true, "the save loop stops: no 5 s retry forever");
  t.clock.ms += 6000;
  t.client.queue(record({ hp: 2 }));
  assert.equal(t.timers.length, 0, "nothing is scheduled while halted");
  t.client.resume(); // a fresh status read said the world is open
  await t.run();
  assert.equal(t.w.calls.filter((c) => c.op === "create_character").length, 1, "no second character");
  assert.equal(t.w.calls.at(-1).body.character, "pc:abc");
  assert.equal(t.client.state.seq, 2, "the sequence continues");
});

test("a record queued while a save is in flight is lowered by the adopted drop, so the clamp is not applied twice (500 -> 300, not 100)", async () => {
  const stored = [];
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const game = { marked: { carried: 500, bank: 0, bounty: 0 } };
  const t = make(
    {
      // The server keeps carried + bank at or under 300.
      save_run: async (body, n) => {
        if (n === 0) await gate;
        const carried = body.record.marked.carried;
        stored.push(carried);
        return carried > 300 ? { revision: n + 1, clamped: true, carried: 300, bank: 0 } : { revision: n + 1 };
      },
    },
    { onCash: (reply, info) => adoptServerCash(game, reply, info) },
  );
  const cash = (carried) => record({ marked: { carried, bank: 0, bounty: 0 } });
  t.client.queue(cash(500), game);
  const first = t.run();
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
  t.client.queue(cash(500), game); // built before the reply came back: the live run still held 500
  release();
  await first;
  assert.equal(game.marked.carried, 300, "adopted once");
  t.clock.ms += 6000;
  await t.run();
  assert.deepEqual(stored, [500, 300], "the pending record was lowered to 300, so the server did not clamp it again");
  assert.equal(game.marked.carried, 300, "not 100");
});

test("a pending record of ANOTHER run is not lowered by this run's adoption", async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const game = { marked: { carried: 500, bank: 0, bounty: 0 } },
    next = { marked: { carried: 500, bank: 0, bounty: 0 } },
    stored = [];
  const t = make(
    {
      save_run: async (body, n) => {
        if (n === 0) await gate;
        stored.push(body.record.marked.carried);
        return { revision: n + 1, clamped: n === 0, carried: 300, bank: 0 };
      },
    },
    { onCash: (reply, info) => adoptServerCash(game, reply, info) },
  );
  const cash = (carried) => record({ marked: { carried, bank: 0, bounty: 0 } });
  t.client.queue(cash(500), game);
  const first = t.run();
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
  t.client.queue(cash(500), next); // a new run (Retry) saved while the old run's save is in flight
  release();
  await first;
  t.clock.ms += 6000;
  await t.run();
  assert.deepEqual(stored, [500, 500], "the new run's record is sent as it was built");
});

test("a token that is not a readable JWT is never cached (no account to key it by) but still works in memory", async () => {
  const t = make({}, { getToken: async () => "opaque-token-123456" });
  t.client.queue(record());
  await t.run();
  assert.equal(t.storage.map.size, 0);
  assert.equal(t.w.calls.at(-1).body.character, "pc:abc");
  assert.equal(accountOf("opaque"), null);
  assert.equal(accountOf(jwt("x")), "x");
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
  watched.setItem(CURRENT_ERA.key, "a");
  watched.setItem("armagedom:area1-run:v1", "b");
  watched.setItem("armagedom:pistol:v1", "c");
  assert.deepEqual(seen, ["a"], "only the newest era's key is the run record");
  assert.equal(storage.getItem("armagedom:pistol:v1"), "c");
  assert.equal(watched.getItem(CURRENT_ERA.key), "a");
  const broken = observeStorage(storage, isRunKey, () => {
    throw Error("listener");
  });
  assert.doesNotThrow(() => broken.setItem(CURRENT_ERA.key, "d"));
  assert.equal(storage.getItem(CURRENT_ERA.key), "d");
});

test("REAL run persistence: the full v18 record a real save writes is under the key the save client watches", () => {
  const f = makeRun();
  f.p.persistRun(f.g);
  const written = f.writes.filter((w) => isRunKey(w.key));
  assert.ok(written.length > 0, `no write under ${CURRENT_ERA.key}; the real writes were: ${[...new Set(f.writes.map((w) => w.key))]}`);
  assert.equal(CURRENT_ERA.key, MARKED_SAVE_KEY);
  const record = JSON.parse(written.at(-1).raw);
  assert.equal(record.version, CURRENT_ERA.version);
  assert.ok(record.marked && record.pistol && record.supplies, "it is the whole run, not a layer");
});

function pullSetup({ run, synced, character = "pc:abc" } = {}) {
  const t = make({ load_run: () => ({ run: run ?? null }) }),
    target = memory();
  if (synced !== undefined) t.storage.map.set(syncedKey("user-1"), JSON.stringify({ character, revision: synced }));
  t.storage.map.set(characterKey("user-1"), character);
  return { ...t, target };
}
const serverRun = (revision, extra = {}) => ({ revision, era: 18, record: { version: 18, hp: 77, ...extra }, savedAt: "t" });

test("pull: a server record newer than this device's last sync replaces the local run, the old one is kept as .pre-sync", async () => {
  const t = pullSetup({ run: serverRun(5), synced: 3 });
  t.target.setItem(CURRENT_ERA.key, "local-raw");
  const result = await t.client.pull({ target: t.target });
  assert.deepEqual(result, { status: "applied", revision: 5 });
  assert.equal(JSON.parse(t.target.getItem(CURRENT_ERA.key)).hp, 77);
  assert.equal(t.target.getItem(`${CURRENT_ERA.key}.pre-sync`), "local-raw", "the local run is never lost");
  assert.deepEqual(JSON.parse(t.storage.map.get(syncedKey("user-1"))), { character: "pc:abc", revision: 5 });
  assert.equal(t.client.state.revision, 5, "the next save continues from the server's revision");
});

test("pull: the same or an older server revision, or no server run, keeps the local run untouched", async () => {
  for (const run of [serverRun(3), serverRun(2), null]) {
    const t = pullSetup({ run, synced: 3 });
    t.target.setItem(CURRENT_ERA.key, "local-raw");
    assert.equal((await t.client.pull({ target: t.target })).status, "kept");
    assert.equal(t.target.getItem(CURRENT_ERA.key), "local-raw");
    assert.equal(t.target.getItem(`${CURRENT_ERA.key}.pre-sync`), null);
  }
});

test("pull: a device that never synced (new device, cleared storage) takes the server's record: one character per account", async () => {
  const t = pullSetup({ run: serverRun(2) }); // no synced marker
  const result = await t.client.pull({ target: t.target });
  assert.equal(result.status, "applied");
  assert.equal(t.w.calls.filter((c) => c.op === "create_character").length, 0, "the cached/known character is reused");
  assert.equal(JSON.parse(t.target.getItem(CURRENT_ERA.key)).hp, 77);
});

test("pull: a record of another era is not applied (it would not override the newest-era key); an unreachable server plays local", async () => {
  const other = pullSetup({ run: { revision: 9, record: { version: 11, hp: 1 } }, synced: 1 });
  assert.deepEqual(await other.client.pull({ target: other.target }), { status: "kept", reason: "other-era" });
  assert.equal(other.target.getItem(CURRENT_ERA.key), null);
  const down = make({ load_run: () => new Error("down") }, {});
  assert.equal((await down.client.pull({ target: memory() })).status, "offline");
});

test("a successful save records its revision as synced, so the next boot does not re-apply the server's copy of it", async () => {
  const t = make({ save_run: () => ({ revision: 4, savedAt: "t" }) });
  t.client.queue(record());
  await t.run();
  assert.deepEqual(JSON.parse(t.storage.map.get(syncedKey("user-1"))), { character: "pc:abc", revision: 4 });
});
