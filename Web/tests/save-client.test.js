import test from "node:test";
import assert from "node:assert/strict";
import {
  accountOf,
  adoptServerCash,
  characterKey,
  createSaveClient,
  isRunKey,
  observeStorage,
  runIsOver,
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
    calls.push({ op, body, auth: init.headers.Authorization, keepalive: init.keepalive === true });
    const answer = await (script[op] ?? (() => ({})))(body, n);
    if (answer instanceof Error) throw answer;
    const status = answer.status ?? 200;
    return {
      ok: status < 400,
      status,
      headers: { get: (name) => answer.headers?.[name.toLowerCase()] ?? null },
      json: async () => answer.body ?? answer,
    };
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
  assert.deepEqual(t.w.calls.map((c) => c.op), ["active", "create_character", "load_run", "save_run"]);
  const save = t.w.calls[3];
  assert.equal(save.auth, `Bearer ${jwt("user-1")}`);
  assert.deepEqual([save.body.character, save.body.era, save.body.revision, save.body.seq], ["pc:abc", 18, 0, 1]);
  assert.equal(t.storage.map.get(characterKey("user-1")), "pc:abc");
  assert.equal(t.client.state.revision, 1);
  // A later save: no new character or load; seq 2 with the new revision.
  t.clock.ms += 6000;
  t.client.queue(record({ hp: 5 }));
  await t.run();
  assert.deepEqual(t.w.calls.slice(4).map((c) => [c.op, c.body.seq, c.body.revision]), [["save_run", 2, 1]]);
});

test("a stash or airdrop claim reaches the writer before the save that carries its cash, and a refused claim is only logged", async () => {
  const t = make({ claim_pickup: (body, n) => (n === 0 ? { credited: body.amount, earned: body.amount } : { refused: "too-soon", retryS: 90 }) });
  t.client.claimPickup("stash:east-3", 120);
  t.client.queue(record());
  await t.run();
  assert.deepEqual(t.w.calls.map((c) => c.op), ["active", "create_character", "claim_pickup", "load_run", "save_run"]);
  assert.deepEqual(t.w.calls.find((c) => c.op === "claim_pickup").body, { source: "stash:east-3", amount: 120 });
  assert.equal(t.lines.length, 0, "a credited claim logs nothing");
  await t.client.claimPickup("stash:east-3", 120);
  assert.match(t.lines.at(-1), /pickup cash not credited: stash:east-3 too-soon/);
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

test("an O0007 refusal (world switched off / not allow-listed) is only logged: the character id and sequence are kept, the cached revision is dropped", async () => {
  const t = make({
    save_run: (body, n) => (n === 0 ? { status: 403, body: { error: "O0007" } } : { revision: 8, savedAt: "t" }),
    load_run: (body, n) => ({ run: n === 0 ? null : { revision: 7 } }),
  });
  t.client.queue(record());
  await t.run();
  assert.match(t.lines[0], /not saved: O0007/);
  assert.equal(t.storage.map.get(characterKey("user-1")), "pc:abc", "the cache is NOT cleared");
  assert.equal(t.client.halted, true, "the save loop stops: no 5 s retry forever");
  assert.equal(t.client.state.revision, null, "the cached revision is reset: the server may have moved on");
  t.clock.ms += 6000;
  t.client.queue(record({ hp: 2 }));
  assert.equal(t.timers.length, 0, "nothing is scheduled while halted");
  t.client.resume(); // a fresh status read said the world is open
  await t.run();
  assert.equal(t.w.calls.filter((c) => c.op === "create_character").length, 1, "no second character");
  assert.equal(t.w.calls.at(-1).body.character, "pc:abc");
  assert.equal(t.client.state.seq, 2, "the sequence continues");
  assert.equal(t.w.calls.filter((c) => c.op === "load_run").length, 2, "the revision is learned again after the halt");
  assert.equal(t.w.calls.at(-1).body.revision, 7, "the save carries the server's current revision, not the stale one");
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

test("pull: a record that arrives after the run was read (canApply false) is kept late: no write, no .pre-sync, no synced mark", async () => {
  const t = pullSetup({ run: serverRun(5), synced: 3 });
  t.target.setItem(CURRENT_ERA.key, "local-raw");
  const result = await t.client.pull({ target: t.target, canApply: () => false });
  assert.deepEqual(result, { status: "kept", reason: "late" });
  assert.equal(t.target.getItem(CURRENT_ERA.key), "local-raw", "phone 1's newer progress is never overwritten by a stale local run");
  assert.equal(t.target.getItem(`${CURRENT_ERA.key}.pre-sync`), null);
  assert.deepEqual(JSON.parse(t.storage.map.get(syncedKey("user-1"))), { character: "pc:abc", revision: 3 }, "not marked synced");
});

test("a fresh second phone (no cached character id) joins the account's active character instead of creating one", async () => {
  const t = make({ active: () => ({ character: "pc:first" }), load_run: () => ({ run: serverRun(2) }) });
  assert.equal(t.storage.map.get(characterKey("user-1")), undefined, "nothing pre-seeded");
  const result = await t.client.pull({ target: memory() });
  assert.equal(result.status, "applied");
  assert.equal(t.w.calls.filter((c) => c.op === "create_character").length, 0, "no new character: the first phone stays active");
  assert.equal(t.w.calls.find((c) => c.op === "load_run").body.character, "pc:first");
  assert.equal(t.storage.map.get(characterKey("user-1")), "pc:first", "remembered for the next boot");
});

test("no active character on the server: one is created; a failed lookup creates nothing", async () => {
  const none = make({ active: () => ({ character: null }) });
  none.client.queue(record());
  await none.run();
  assert.equal(none.w.calls.filter((c) => c.op === "create_character").length, 1);
  const failed = make({ active: () => ({ status: 500, body: { error: "error" } }) });
  failed.client.queue(record());
  await failed.run();
  assert.equal(failed.w.calls.filter((c) => c.op === "create_character").length, 0, "unknown is not 'none'");
  assert.equal(failed.w.calls.filter((c) => c.op === "save_run").length, 0);
});

test("pull: a record of another era is not applied (it would not override the newest-era key); an unreachable server plays local", async () => {
  const other = pullSetup({ run: { revision: 9, record: { version: 11, hp: 1 } }, synced: 1 });
  assert.deepEqual(await other.client.pull({ target: other.target }), { status: "kept", reason: "other-era" });
  assert.equal(other.target.getItem(CURRENT_ERA.key), null);
  const down = make({ load_run: () => new Error("down") }, {});
  assert.equal((await down.client.pull({ target: memory() })).status, "offline");
});

// Death must not be escapable by closing the tab: the dead run's record leaves at once (no interval), a rate limit never drops it, and
// the page-hide send carries the newest record with a keepalive request.
const dead = (extra = {}) => record({ hp: 0, ...extra });
const saves = (t) => t.w.calls.filter((c) => c.op === "save_run");

test("runIsOver: a finished run or one at 0 hp, nothing else", () => {
  assert.equal(runIsOver({ finished: true, player: { hp: 50 } }), true);
  assert.equal(runIsOver({ player: { hp: 0 } }), true);
  assert.equal(runIsOver({ player: { hp: 14 } }), false);
  assert.equal(runIsOver(null), false);
});

test("a death record skips the interval: queued 1 s after a routine save it is sent at once, with the dead state", async () => {
  const t = make();
  const run = { id: "run-1" };
  t.client.queue(record({ hp: 14 }), run);
  await t.run();
  t.clock.ms += 1000; // the tab will close right after this
  t.client.queue(dead(), run, { urgent: true });
  assert.equal(t.timers.at(-1).ms, 0, "no wait for the 5 s interval");
  await t.run();
  assert.deepEqual(saves(t).map((c) => JSON.parse(JSON.stringify(c.body.record)).hp), [14, 0]);
  assert.deepEqual(saves(t).map((c) => c.body.seq), [1, 2]);
});

test("only the first death record of a run is urgent: later writes of the same dead run wait the interval", async () => {
  const t = make();
  const run = { id: "run-1" };
  t.client.queue(dead(), run, { urgent: true });
  await t.run();
  t.client.queue(dead({ extra: 1 }), run, { urgent: true });
  assert.ok(t.timers.at(-1).ms > 0, "a repeat of the same death is routine");
  t.client.queue(dead(), { id: "run-2" }, { urgent: true });
  assert.equal(t.timers.at(-1).ms, 0, "a new run's death is urgent again");
});

test("a 429 never drops the record: it stays queued, waits the writer's retryMs, is sent again with the same sequence number", async () => {
  let n = 0;
  const t = make({ save_run: () => (++n === 1 ? { status: 429, body: { error: "rate-limited", retryMs: 3000 } } : { revision: 1, savedAt: "t" }) });
  t.client.queue(dead(), { id: "r" }, { urgent: true });
  await t.run();
  assert.match(t.lines[0], /not saved: rate-limited/);
  assert.equal(t.timers.at(-1).ms, 3000, "waits the Retry-After");
  t.clock.ms += 5000; // the wait passes (the bucket refills)
  await t.run();
  assert.deepEqual(saves(t).map((c) => [c.body.seq, c.body.record.hp]), [[1, 0], [1, 0]]);
  assert.equal(t.client.state.revision, 1);
});

test("a record that arrived while a rate-limited save was refused replaces the kept one (the newest wins)", async () => {
  let n = 0;
  let queueMore = () => {};
  const t = make({
    save_run: () => {
      if (++n === 1) {
        queueMore();
        return { status: 429, body: { error: "rate-limited", retryMs: 1000 } };
      }
      return { revision: 1, savedAt: "t" };
    },
  });
  queueMore = () => t.client.queue(record({ hp: 7 }));
  t.client.queue(record({ hp: 9 }));
  await t.run();
  await drain(t);
  assert.deepEqual(saves(t).map((c) => c.body.record.hp), [9, 7]);
});

test("a proxy's 429 (Retry-After header, no JSON body) is honoured the same way: the record is kept and resent after the wait", async () => {
  let n = 0;
  const t = make({ save_run: () => (++n === 1 ? { status: 429, headers: { "retry-after": "7" }, body: {} } : { revision: 1, savedAt: "t" }) });
  t.client.queue(dead(), { id: "r" }, { urgent: true });
  await t.run();
  assert.equal(t.timers.at(-1).ms, 7000);
  t.clock.ms += 7000;
  await t.run();
  assert.deepEqual(saves(t).map((c) => c.body.record.hp), [0, 0]);
  assert.equal(t.client.state.revision, 1);
});

test("a server error (5xx) keeps the record and retries after the normal interval, not at once", async () => {
  let n = 0;
  const t = make({ save_run: () => (++n === 1 ? { status: 503, body: {} } : { revision: 1, savedAt: "t" }) });
  t.client.queue(record({ hp: 5 }));
  await t.run();
  assert.equal(t.timers.at(-1).ms, GAME_DATA.saveClient.minSaveIntervalMs);
  await t.run();
  assert.equal(saves(t).length, 2);
});

test("the real wiring: a dead run written through the watched storage is sent at once; the tab closed 1 s later loses nothing", async () => {
  const t = make();
  const raw = memory();
  const game = { player: { hp: 14 }, finished: false };
  const watched = observeStorage(raw, isRunKey, (value) => t.client.queue(value, game, { urgent: runIsOver(game) }));
  watched.setItem(CURRENT_ERA.key, record({ hp: 14 }));
  await t.run();
  t.clock.ms += 1000;
  game.player.hp = 0; // the player dies; the run is persisted in the same step
  watched.setItem(CURRENT_ERA.key, dead());
  assert.equal(t.timers.at(-1).ms, 0, "no wait for the interval");
  await t.run();
  assert.deepEqual(saves(t).map((c) => c.body.record.hp), [14, 0], "the server's newest record is the death");
  assert.equal(t.client.flushOnHide(), false, "the tab closes: nothing is left unsent");
});

test("a death that happens while a routine save is in flight goes out the moment that save returns, with no interval wait", async () => {
  let release;
  let n = 0;
  const t = make({
    save_run: () => (++n === 1 ? new Promise((resolve) => (release = () => resolve({ revision: 1, savedAt: "t" }))) : { revision: 2, savedAt: "t" }),
  });
  const run = { id: "r" };
  t.client.queue(record({ hp: 14 }), run);
  const inFlight = t.run();
  await new Promise((r) => setTimeout(r, 5)); // the routine save is on the wire
  t.client.queue(dead(), run, { urgent: true });
  assert.equal(t.timers.length, 0, "nothing can be sent while one is in flight");
  release();
  await inFlight;
  assert.equal(t.timers.at(-1).ms, 0, "the death is next, at once");
  await t.run();
  assert.deepEqual(saves(t).map((c) => [c.body.record.hp, c.body.revision]), [[14, 0], [0, 1]]);
});

// The Auditor's probe (#166): a routine save A is in flight when the page hides; the death B leaves by keepalive and lands first. A must
// stop (stale-seq / stale), never retry over B. The fake writer applies the real check order (seq < last: stale-seq, = last:
// seq-conflict, then the revision guard) at the moment a request ARRIVES; a reply can be held back separately.
function orderedServer() {
  const s = { revision: 0, lastSeq: 0, written: [] };
  s.arrive = (body) => {
    if (body.seq < s.lastSeq) return { refused: "stale-seq", lastSeq: s.lastSeq };
    if (body.seq === s.lastSeq) return { refused: "seq-conflict", lastSeq: s.lastSeq };
    if (body.revision !== s.revision) return { refused: "stale", revision: s.revision };
    s.revision++;
    s.lastSeq = body.seq;
    s.written.push(body.record.hp);
    return { revision: s.revision, savedAt: "t" };
  };
  return s;
}
const gate = () => {
  let open;
  const promise = new Promise((resolve) => (open = resolve));
  return { promise, open };
};
const tick = () => new Promise((r) => setTimeout(r, 5));

for (const order of ["B's reply first, then A arrives", "A arrives first, B's reply held until after"]) {
  test(`a routine save in flight when the page hides never overwrites the death (${order})`, async () => {
    const server = orderedServer(),
      aArrives = gate(),
      bReplies = gate();
    const t = make({
      save_run: async (body, n) => {
        if (n === 0) return server.arrive(body); // the first routine save: learns revision 1 (n counts earlier save_run calls)
        if (n === 1) {
          await aArrives.promise; // A is held in the network
          return server.arrive(body);
        }
        const answer = server.arrive(body); // B, the page-hide send: lands at once
        await bReplies.promise;
        return answer;
      },
    });
    t.client.queue(record({ hp: 20 }));
    await t.run();
    t.client.queue(record({ hp: 14 }));
    const inFlight = t.run(); // A: revision 1, seq 2
    await tick();
    t.client.queue(dead());
    assert.equal(t.client.flushOnHide(), true);
    await tick();
    assert.deepEqual(server.written, [20, 0], "B landed");
    if (order.startsWith("B's")) {
      bReplies.open();
      await tick();
      aArrives.open();
    } else {
      aArrives.open();
      await tick();
      bReplies.open();
    }
    await inFlight;
    await tick();
    assert.deepEqual(server.written, [20, 0], "the death is the last write: A was never accepted");
    assert.equal(saves(t).length, 3, "A was not retried");
    assert.match(t.lines.join("\n"), /not saved: superseded/);
    // Nothing older is queued behind it: a later routine save carries on from the server's revision.
    t.clock.ms += 6000;
    t.client.queue(dead({ extra: 1 }));
    await drain(t);
    assert.equal(server.written.at(-1), 0);
  });
}

test("a page-hide send refused as stale because our OWN in-flight save landed first is kept and sent again on top of it (the death is not lost)", async () => {
  const server = orderedServer(),
    aArrives = gate(),
    aReplies = gate();
  const t = make({
    save_run: async (body, n) => {
      if (n === 0) return server.arrive(body);
      if (n === 1) {
        await aArrives.promise;
        const answer = server.arrive(body); // A lands BEFORE B arrives ...
        await aReplies.promise; // ... but its reply has not reached the client yet
        return answer;
      }
      return server.arrive(body); // B: built with the old revision -> stale
    },
  });
  t.client.queue(record({ hp: 20 }));
  await t.run();
  t.client.queue(record({ hp: 14 }));
  const inFlight = t.run();
  await tick();
  t.client.queue(dead());
  aArrives.open(); // A reaches the server first
  await tick();
  t.client.flushOnHide(); // B is built from the cached revision, which A has already moved on at the server
  await tick();
  aReplies.open();
  await inFlight;
  await tick();
  await drain(t);
  assert.deepEqual(server.written, [20, 14, 0], "A landed, then the kept death was sent on A's revision: the server ends on the death");
  assert.equal(saves(t).length, 4, "the stale-refused hide send and exactly one resend");
  assert.equal(t.client.state.revision, 3);
  assert.match(t.lines.join("\n"), /our own save landed first/);
});

test("a hide send refused as stale with our own save in flight, when the stale was really another device's, is resent once and refused again: nothing is overwritten", async () => {
  const server = orderedServer(),
    aArrives = gate();
  const t = make({
    save_run: async (body, n) => {
      if (n === 0) return server.arrive(body);
      if (n === 1) {
        await aArrives.promise;
        return server.arrive(body); // A arrives after the other device moved the revision: stale too
      }
      return server.arrive(body);
    },
  });
  t.client.queue(record({ hp: 20 }));
  await t.run();
  t.client.queue(record({ hp: 14 }));
  const inFlight = t.run();
  await tick();
  t.client.queue(dead());
  server.revision = 5; // a second device saved
  server.lastSeq = 0;
  t.client.flushOnHide(); // B: stale
  await tick();
  aArrives.open(); // A: stale as well, superseded
  await inFlight;
  await tick();
  await drain(t);
  assert.deepEqual(server.written, [20], "the other device's revision 5 is never overwritten");
  assert.equal(saves(t).length <= 4, true, "the resend happened at most once, no loop");
});

test("a death queued during a LOCAL bucket hold goes out at once on the reserve; it does not wait out the routine hold", async () => {
  let server;
  const t = make({ save_run: (body) => server.arrive(body) });
  server = bucketServer(t.clock);
  const run = { id: "fight" };
  for (let i = 0; i < 5; i++) {
    t.client.queue(record({ hp: 100 - i }), run);
    await t.run(); // the first 4 are sent; the 5th is held back locally (the reserve is not for routine saves)
  }
  assert.equal(server.written.length, 4);
  assert.ok(t.timers.at(-1).ms > 0, "the routine record is waiting out its hold");
  t.client.queue(dead(), run, { urgent: true });
  assert.equal(t.timers.at(-1).ms, 0, "the death does not wait for the routine hold");
  await t.run();
  assert.equal(server.written.at(-1), 0, "sent on the reserve");
  assert.equal(server.limited, 0);
});

test("a death save's OWN refusal still waits its Retry-After (an urgent record must not spin against the bucket)", async () => {
  let n = 0;
  const t = make({ save_run: () => (++n === 1 ? { status: 429, body: { error: "rate-limited", retryMs: 3000 } } : { revision: 1, savedAt: "t" }) });
  t.client.queue(dead(), { id: "r" }, { urgent: true });
  await t.run();
  assert.equal(t.timers.at(-1).ms, 3000, "the death waits the 429's Retry-After, not zero");
  t.client.queue(dead({ extra: 1 }), { id: "r" }, { urgent: true }); // the same run again: routine, still the same hold
  assert.equal(t.timers.at(-1).ms, 3000);
});

test("another device's newer save is never overwritten by a page-hide send: stale stops, even with the outcome marked uncertain", async () => {
  const server = orderedServer();
  const t = make({ save_run: (body) => server.arrive(body) });
  t.client.queue(record({ hp: 20 }));
  await t.run(); // revision 1
  server.revision = 5; // a second device saved meanwhile (revision 5)
  server.lastSeq = 0;
  t.client.queue(dead());
  assert.equal(t.client.flushOnHide(), true);
  assert.equal(t.client.state.uncertain, false, "nothing was in flight: a later stale is another device, never our own save");
  await tick();
  assert.deepEqual(server.written, [20], "the hide send was refused");
  assert.equal(t.client.state.revision, 1, "no adoption of revision 5");
  assert.equal(t.client.flushOnHide(), false, "nothing is requeued");
  await drain(t); // any timer left from the queue call finds nothing to send
  assert.equal(saves(t).length, 2, "no resend: the first save and the refused hide send only");
  assert.deepEqual(server.written, [20]);
});

// Run every pending send, letting each wait pass on the test clock first; capped so a send that never settles fails instead of hanging.
async function drain(t, cap = 100) {
  for (let i = 0; t.timers.length; i++) {
    assert.ok(i < cap, "the sends never settle");
    t.clock.ms += t.timers[0].ms;
    await t.run();
  }
}
// The writer's per-account save bucket (server/writer DEFAULT_LIMITS: burst 6, one token per 5 s) on the test clock: 429 when empty.
function bucketServer(clock, burst = 6, refillMs = 5000) {
  const s = { tokens: burst, at: clock.ms, limited: 0, written: [], revision: 0 };
  s.arrive = (body) => {
    s.tokens = Math.min(burst, s.tokens + (clock.ms - s.at) / refillMs);
    s.at = clock.ms;
    if (s.tokens < 1) {
      s.limited++;
      return { status: 429, body: { error: "rate-limited", retryMs: Math.ceil((1 - s.tokens) * refillMs) } };
    }
    s.tokens -= 1;
    s.revision++;
    s.written.push(body.record.hp);
    return { revision: s.revision, savedAt: "t" };
  };
  return s;
}

test("pacing: routine saves never spend the 2-token reserve, however fast they are asked for; the death save may", async () => {
  let server;
  const t = make({ save_run: (body) => server.arrive(body) });
  server = bucketServer(t.clock);
  const run = { id: "fight" };
  for (let i = 0; i < 10; i++) {
    t.client.queue(record({ hp: 100 - i }), run);
    await t.run(); // asked for with no time passing: far faster than the bucket refills
  }
  assert.equal(server.written.length, GAME_DATA.saveClient.bucketBurst - GAME_DATA.saveClient.bucketReserve, "4 routine saves, then the client holds back");
  assert.equal(server.limited, 0, "the client never got a 429: it paced itself");
  t.client.queue(dead(), run, { urgent: true });
  await drain(t);
  assert.equal(server.limited, 0);
  assert.equal(server.written.at(-1), 0, "the death save used the reserve and was written");
});

test("a fight-length burst of routine saves, then the death within 1 s: the death is sent with no 429 (Backend's 1 s close, 6 of 6)", async () => {
  let server;
  const t = make({ save_run: (body) => server.arrive(body) });
  server = bucketServer(t.clock);
  const run = { id: "fight" };
  for (let i = 0; i < 24; i++) {
    t.client.queue(record({ hp: 100 - i }), run);
    t.clock.ms += 2500; // routine records arrive twice as fast as the bucket refills: the client must hold some back
    await t.run();
  }
  t.clock.ms += 1000; // the player dies; the tab is closed 1 s later
  t.client.queue(dead(), run, { urgent: true });
  t.timers.length = 0; // only the death send matters now: the one timer the urgent queue asked for (wait 0)
  t.timers.push({ fn: () => t.client.flush(), ms: 0 });
  await t.run();
  assert.equal(server.limited, 0, "not one 429 in the whole fight, so none on the death save");
  assert.equal(server.written.at(-1), 0, "the server's newest record is the death");
  assert.equal(t.client.flushOnHide(), false, "nothing is left unsent when the tab closes");
});

test("every request costs a token, a stale-seq retry too, and a server 429 empties our copy of the bucket", async () => {
  let n = 0;
  const t = make({ save_run: () => (++n === 1 ? { refused: "stale-seq", lastSeq: 5 } : { revision: 1, savedAt: "t" }) });
  t.client.queue(record());
  await t.run(); // the refusal and the retry are two requests
  assert.equal(saves(t).length, 2);
  const limited = make({ save_run: () => ({ status: 429, body: { error: "rate-limited", retryMs: 4000 } }) });
  limited.client.queue(record());
  await limited.run();
  limited.client.queue(record({ hp: 1 }));
  await limited.run(); // the copy says empty: nothing is sent until the wait has passed
  assert.equal(saves(limited).length, 1);
});

test("a 502 or 504 (the writer may have committed) leaves the outcome uncertain, so the next 'stale' is our own save", async () => {
  let n = 0;
  const t = make({ save_run: () => (++n === 1 ? { status: 504, body: {} } : { revision: 1, savedAt: "t" }) });
  t.client.queue(record());
  await t.run();
  assert.equal(t.client.state.uncertain, true);
});

test("a network failure keeps the record queued for another try", async () => {
  let n = 0;
  const t = make({ save_run: () => (++n === 1 ? new Error("offline") : { revision: 1, savedAt: "t" }) });
  t.client.queue(dead(), { id: "r" }, { urgent: true });
  await t.run();
  assert.ok(t.timers.at(-1).ms >= 250, "a retry is scheduled");
  await t.run();
  assert.equal(saves(t).length, 2);
  assert.equal(saves(t)[1].body.record.hp, 0);
});

test("pagehide: the newest unsent record leaves synchronously with a keepalive request, and nothing is left queued", async () => {
  const t = make();
  t.client.queue(record({ hp: 14 }));
  await t.run(); // learns the character and revision, caches the token
  t.client.queue(dead());
  const before = t.w.calls.length;
  assert.equal(t.client.flushOnHide(), true);
  assert.equal(t.w.calls.length, before + 1, "the request starts inside the handler, not after an await");
  const last = t.w.calls.at(-1);
  assert.deepEqual([last.op, last.keepalive, last.body.record.hp, last.body.seq, last.body.revision], ["save_run", true, 0, 2, 1]);
  assert.equal(last.auth, `Bearer ${jwt("user-1")}`);
  assert.equal(t.client.flushOnHide(), false, "nothing newer to send");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(t.client.state.uncertain, false, "the reply settled the outcome");
});

test("pagehide before the character and revision are known sends nothing and keeps the record queued", () => {
  const t = make();
  t.client.queue(dead());
  assert.equal(t.client.flushOnHide(), false);
  assert.equal(t.w.calls.length, 0);
});

test("a failed pagehide send puts the record back, so the next flush resends it", async () => {
  let n = 0;
  const t = make({ save_run: () => (++n === 2 ? new Error("offline") : { revision: n, savedAt: "t" }) });
  t.client.queue(record({ hp: 14 }));
  await t.run();
  t.client.queue(dead());
  assert.equal(t.client.flushOnHide(), true);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(t.client.state.uncertain, true, "the outcome is unknown after a network error");
  assert.equal(t.client.flushOnHide(), true, "the record was kept");
});

test("the beacon's log lines name the HTTP status, and a death save's failure says [death]", async () => {
  const routine = make({ save_run: () => ({ status: 429, body: { error: "rate-limited", retryMs: 4000 } }) });
  routine.client.queue(record());
  await routine.run();
  assert.equal(routine.lines[0], "[arma-save] not saved: rate-limited (http 429)");
  const death = make({ save_run: () => ({ status: 429, body: { error: "rate-limited", retryMs: 4000 } }) });
  death.client.queue(dead(), { id: "r" }, { urgent: true });
  await death.run();
  assert.equal(death.lines[0], "[arma-save] not saved: rate-limited (http 429) [death]");
});

test("a pagehide send the writer refuses or never answers is logged with its status (the keepalive answer was invisible before)", async () => {
  let n = 0;
  const t = make({ save_run: () => (++n === 2 ? { status: 429, body: { error: "rate-limited" } } : { revision: n, savedAt: "t" }) });
  t.client.queue(record({ hp: 14 }));
  await t.run();
  t.client.queue(dead());
  assert.equal(t.client.flushOnHide(), true);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(t.lines, ["[arma-save] page-hide save not saved: rate-limited (http 429)"]);
  let m = 0; // a second client whose hide send fails on the network
  const net = make({ save_run: () => (++m === 2 ? new Error("offline") : { revision: m, savedAt: "t" }) });
  net.client.queue(record({ hp: 14 }));
  await net.run();
  net.client.queue(dead());
  net.client.flushOnHide();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(net.lines, ["[arma-save] page-hide save not saved: network"]);
});

test("a successful save records its revision as synced, so the next boot does not re-apply the server's copy of it", async () => {
  const t = make({ save_run: () => ({ revision: 4, savedAt: "t" }) });
  t.client.queue(record());
  await t.run();
  assert.deepEqual(JSON.parse(t.storage.map.get(syncedKey("user-1"))), { character: "pc:abc", revision: 4 });
});

const settle = () => new Promise((resolve) => setImmediate(resolve));
const claimCalls = (t) => t.w.calls.filter((c) => c.op === "claim_pickup");
async function fire(t) {
  const timer = t.timers.shift();
  timer.fn();
  await settle();
}
test("six cash claims against the writer's burst of four are all credited, spaced by the bucket", async () => {
  assert.equal(GAME_DATA.saveClient.claimBurst, 4);
  const t = make({ claim_pickup: (body) => ({ credited: body.amount, earned: body.amount }) });
  const done = [1, 2, 3, 4, 5, 6].map((n) => t.client.claimPickup("kill:trash", n));
  await settle();
  assert.equal(claimCalls(t).length, 4, "the burst goes at once");
  assert.equal(t.timers.length, 1, "the rest wait for the bucket");
  t.clock.ms += GAME_DATA.saveClient.claimRefillMs;
  await fire(t);
  assert.equal(claimCalls(t).length, 5);
  t.clock.ms += GAME_DATA.saveClient.claimRefillMs;
  await fire(t);
  await Promise.all(done);
  assert.deepEqual(claimCalls(t).map((c) => c.body.amount), [1, 2, 3, 4, 5, 6]);
  assert.equal(t.lines.length, 0, "nothing was refused");
});
test("a routine save issued mid-queue goes out only after all six claims are credited", async () => {
  const t = make({ claim_pickup: (body) => ({ credited: body.amount, earned: body.amount }) });
  [1, 2, 3, 4, 5, 6].forEach((n) => t.client.claimPickup("kill:trash", n));
  await settle();
  t.client.queue(record());
  assert.equal(t.timers.length, 2, "a claim timer and the save timer");
  t.timers.splice(1, 1)[0].fn(); // the save starts now, with claims 5 and 6 still waiting
  await settle();
  assert.equal(t.w.calls.filter((c) => c.op === "save_run").length, 0, "the save waits for the queue");
  assert.equal(claimCalls(t).length, 4);
  t.clock.ms += GAME_DATA.saveClient.claimRefillMs;
  await fire(t);
  assert.equal(t.w.calls.filter((c) => c.op === "save_run").length, 0, "five of six is still not all");
  t.clock.ms += GAME_DATA.saveClient.claimRefillMs;
  await fire(t);
  await settle();
  const ops = t.w.calls.map((c) => c.op),
    save = ops.indexOf("save_run");
  assert.ok(save > 0);
  assert.equal(ops.slice(0, save).filter((op) => op === "claim_pickup").length, 6, "all six claims came first");
});
test("an urgent (death) save is not held for the claim bucket", async () => {
  const t = make({ claim_pickup: (body) => ({ credited: body.amount, earned: body.amount }) });
  [1, 2, 3, 4, 5, 6].forEach((n) => t.client.claimPickup("kill:trash", n));
  await settle();
  t.client.queue(record({ dead: true }), {}, { urgent: true });
  t.timers.splice(1, 1)[0].fn();
  await settle();
  assert.equal(claimCalls(t).length, 4, "claims 5 and 6 are still waiting for the bucket");
  assert.equal(t.w.calls.filter((c) => c.op === "save_run").length, 1, "the death save went anyway");
});
test("a 429 on a claim waits its retryMs and sends the same claim again", async () => {
  const t = make({ claim_pickup: (body, n) => (n === 0 ? { status: 429, error: "rate-limited", retryMs: 3000 } : { credited: body.amount, earned: body.amount }) });
  const done = t.client.claimPickup("kill:creature", 15);
  await settle();
  assert.equal(claimCalls(t).length, 1);
  assert.equal(t.timers.length, 1);
  assert.ok(t.timers[0].ms >= 3000);
  t.clock.ms += 3000;
  await fire(t);
  assert.equal(claimCalls(t).length, 1, "a 429 means the bucket is empty: it still has to refill a token");
  t.clock.ms += GAME_DATA.saveClient.claimRefillMs;
  await fire(t);
  await done;
  assert.deepEqual(claimCalls(t).map((c) => c.body), [{ source: "kill:creature", amount: 15 }, { source: "kill:creature", amount: 15 }]);
  assert.equal(t.lines.length, 0);
});
test("a kill-tier rate-limit refusal waits retryS and retries; a bad-amount refusal is only logged", async () => {
  const t = make({
    claim_pickup: (body, n) => (body.amount === 99 ? { refused: "bad-amount" } : n === 0 ? { refused: "rate-limit", retryS: 2 } : { credited: body.amount }),
  });
  const done = t.client.claimPickup("kill:boss", 30);
  await settle();
  assert.equal(claimCalls(t).length, 1);
  t.clock.ms += 2000;
  await fire(t);
  await done;
  assert.equal(claimCalls(t).length, 2);
  await t.client.claimPickup("kill:boss", 99);
  assert.match(t.lines.at(-1), /pickup cash not credited: kill:boss bad-amount/);
  assert.equal(claimCalls(t).length, 3, "a refusal that is not for rate is not retried");
});
test("a claim refused for rate more than claimRetries times is given up and logged", async () => {
  const t = make({ claim_pickup: () => ({ refused: "rate-limit", retryS: 1 }) });
  const done = t.client.claimPickup("kill:trash", 5);
  for (let i = 0; i <= GAME_DATA.saveClient.claimRetries; i++) {
    await settle();
    t.clock.ms += GAME_DATA.saveClient.claimRefillMs; // long enough for the retry wait and for the bucket to give a token back
    if (t.timers.length) await fire(t);
  }
  await done;
  assert.equal(claimCalls(t).length, GAME_DATA.saveClient.claimRetries + 1);
  assert.match(t.lines.at(-1), /not credited: kill:trash rate-limit/);
});
