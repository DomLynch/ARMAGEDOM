// The writer service over real HTTP on 127.0.0.1, with the database being the real migrations on pglite, queried AS the role arma_writer
// (so a missing grant fails here exactly as it would on Supabase). Tokens are faked ("user:<uuid>"); nothing leaves the machine.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { call, freshDb, ids, openFor } from "./helpers.js";
import { createWriter, spawnRowsFrom } from "../../writer/writer.js";

const v18 = JSON.parse(fs.readFileSync(new URL("../../../Web/tests/fixtures/navigation203-source202-v18.json", import.meta.url), "utf8"));
const KEY = "internal-key-for-tests";
const spawns = { "wolf-1": { kind: "wolf", area: "east", maxHp: 40 } };

// Tests that are not about the rate limit run with limits too high to matter; the limit tests pass their own.
const UNLIMITED = { save_run: { burst: 1e6, refillMs: 1 }, load_run: { burst: 1e6, refillMs: 1 } };

async function start({ limits = UNLIMITED, now } = {}) {
  const pg = await freshDb();
  await pg.exec("update public.arma_config set value = 'false'::jsonb where key = 'enforce_cash'"); // these tests save the v18 fixture; see cash.test.js
  await openFor(pg, ids.alice, ids.bob);
  await pg.exec(`delete from public.arma_weapon_rules; insert into public.arma_weapon_rules values ('knife', 10, 4); delete from public.arma_loot_rules; insert into public.arma_loot_rules values ('wolf-1', 0, 'wolf-pelt', 1);`);
  await pg.exec("set role arma_writer");
  const db = { query: async (sql, params) => (await pg.query(sql, params)).rows };
  const verify = async (token) => (token.startsWith("user:") ? token.slice(5) : null);
  const writer = createWriter({ db, verify, spawnRows: spawnRowsFrom(spawns), internalKey: KEY, limits, ...(now ? { now } : {}) });
  await new Promise((resolve) => writer.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${writer.server.address().port}`;
  const post = async (path, body, { as = null, key = null, raw } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (as) headers.Authorization = `Bearer user:${as}`;
    if (key) headers["x-arma-internal-key"] = key;
    const res = await fetch(base + path, { method: "POST", headers, body: raw ?? JSON.stringify(body ?? {}) });
    return { status: res.status, body: await res.json() };
  };
  return { pg, writer, base, post, close: () => new Promise((resolve) => writer.server.close(resolve)) };
}

test("authentication: a token is required, checked, and routes are exact", async () => {
  const t = await start();
  try {
    assert.equal((await t.post("/arma/create_character", { name: "X" })).status, 401);
    const bad = await fetch(t.base + "/arma/create_character", { method: "POST", headers: { Authorization: "Bearer forged-token-123" }, body: "{}" });
    assert.equal(bad.status, 401);
    assert.equal((await t.post("/arma/nothing", {}, { as: ids.alice })).status, 404);
    assert.equal((await fetch(t.base + "/arma/create_character")).status, 405);
    assert.equal((await t.post("/arma/create_character", null, { as: ids.alice, raw: "{not json" })).status, 400);
    assert.equal((await t.post("/arma/create_character", null, { as: ids.alice, raw: JSON.stringify({ pad: "x".repeat(300_000) }) })).status, 413);
    assert.equal((await (await fetch(t.base + "/health")).json()).ok, true);
  } finally {
    await t.close();
  }
});

test("a character and its run round-trip through the writer, and a stale phone is refused", async () => {
  const t = await start();
  try {
    const made = await t.post("/arma/create_character", { name: "Alice" }, { as: ids.alice });
    assert.equal(made.status, 200);
    const character = made.body.character;
    assert.match(character, /^pc:/);
    assert.equal((await t.post("/arma/load_run", { character }, { as: ids.alice })).body.run, null);
    assert.equal((await t.post("/arma/save_run", { character, era: 18, record: v18, revision: 0, seq: 1 }, { as: ids.alice })).body.revision, 1);
    assert.deepEqual((await t.post("/arma/save_run", { character, era: 18, record: v18, revision: 0, seq: 2 }, { as: ids.alice })).body.refused, "stale");
    assert.equal((await t.post("/arma/save_run", { character, era: 18, record: v18, revision: "x", seq: 3 }, { as: ids.alice })).status, 400);
    for (const seq of [undefined, 0, -1, 1.5, "1", 2 ** 31])
      assert.equal((await t.post("/arma/save_run", { character, era: 18, record: v18, revision: 1, seq }, { as: ids.alice })).status, 400, `seq ${seq}`);
    assert.equal((await t.post("/arma/save_run", { character, era: 18, record: [v18], revision: 1, seq: 3 }, { as: ids.alice })).status, 400, "a record must be an object");
    const run = (await t.post("/arma/load_run", { character }, { as: ids.alice })).body.run;
    assert.deepEqual([run.era, run.revision, run.record.hp], [18, 1, v18.hp]);
    // Not Bob's character: the database refuses with O0007, which the writer reports as 403.
    assert.equal((await t.post("/arma/save_run", { character, era: 18, record: v18, revision: 1, seq: 3 }, { as: ids.bob })).status, 403);
    assert.equal((await t.post("/arma/create_character", { name: "Eve" }, { as: ids.carol })).status, 403, "an account without access");
  } finally {
    await t.close();
  }
});

test("active: the account's active character, or null before it has one (a second device joins it instead of creating another)", async () => {
  const t = await start();
  try {
    assert.equal((await t.post("/arma/active", {})).status, 401);
    assert.deepEqual((await t.post("/arma/active", {}, { as: ids.alice })).body, { character: null });
    const made = await t.post("/arma/create_character", { name: "Alice" }, { as: ids.alice });
    assert.deepEqual((await t.post("/arma/active", {}, { as: ids.alice })).body, { character: made.body.character });
    assert.deepEqual((await t.post("/arma/active", {}, { as: ids.bob })).body, { character: null }, "never another account's character");
  } finally {
    await t.close();
  }
});

test("requests for one account run one at a time: two racing saves cannot both win", async () => {
  const t = await start();
  try {
    const { character } = (await t.post("/arma/create_character", { name: "Alice" }, { as: ids.alice })).body;
    // Six different phones' attempts, each with its own sequence number, all from revision 0.
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => t.post("/arma/save_run", { character, era: 18, record: { ...v18, hp: 10 + i }, revision: 0, seq: i + 1 }, { as: ids.alice })));
    assert.equal(results.filter((r) => r.body.savedAt !== undefined).length, 1, "exactly one save was stored");
    assert.equal(results.filter((r) => r.body.refused === "stale").length, 5);
  } finally {
    await t.close();
  }
});

test("a retry with the same seq is answered again and writes nothing; seq conflicts and stale seqs are refused", async () => {
  const t = await start();
  try {
    const { character } = (await t.post("/arma/create_character", { name: "Alice" }, { as: ids.alice })).body;
    const save = (record, revision, seq) => t.post("/arma/save_run", { character, era: 18, record, revision, seq }, { as: ids.alice });
    const first = await save(v18, 0, 5);
    assert.equal(first.body.revision, 1);
    // The answer was lost, so the phone retries the same save with the same seq and the same (old) revision.
    const retry = await save(v18, 0, 5);
    assert.deepEqual(retry.body, { ...first.body, replayed: true });
    assert.equal((await t.post("/arma/load_run", { character }, { as: ids.alice })).body.run.revision, 1, "the retry wrote nothing");
    assert.equal((await save({ ...v18, hp: 3 }, 0, 5)).body.refused, "seq-conflict", "same seq, different save");
    assert.equal((await save(v18, 1, 5)).body.refused, "seq-conflict", "same seq, different revision");
    assert.deepEqual([(await save(v18, 1, 4)).body.refused, (await save(v18, 1, 4)).body.lastSeq], ["stale-seq", 5]);
    // A refused attempt does not use up its number: seq 6 refused as stale-revision, then applies with the right revision.
    assert.equal((await save({ ...v18, hp: 9 }, 0, 6)).body.refused, "stale");
    assert.equal((await save({ ...v18, hp: 9 }, 1, 6)).body.revision, 2);
    assert.equal((await save({ ...v18, hp: 9 }, 1, 6)).body.replayed, true);
  } finally {
    await t.close();
  }
});

test("a record is checked for shape and caps before it is stored, and the refusal names the path", async () => {
  const t = await start();
  try {
    const { character } = (await t.post("/arma/create_character", { name: "Alice" }, { as: ids.alice })).body;
    let seq = 0;
    const save = (record) => t.post("/arma/save_run", { character, era: 18, record, revision: 0, seq: ++seq }, { as: ids.alice }).then((r) => r.body);
    const reason = async (record) => (await save(record)).reason;
    const withPath = (fn) => {
      const copy = structuredClone(v18);
      fn(copy);
      return copy;
    };
    assert.equal(await reason(withPath((r) => (r.hp = 1e6))), "cap:hp");
    assert.equal(await reason(withPath((r) => (r.hp = -1))), "cap:hp");
    // hp itself may be fractional since 000012 (core.test.js); a number that must stay whole still names its path:
    assert.equal(await reason(withPath((r) => (r.marked.carried = 10.5))), "shape:integer:marked.carried");
    assert.equal(await reason(withPath((r) => (r.cheat = 1))), "shape:key:cheat", "a closed set of top-level keys");
    assert.equal(await reason(withPath((r) => (r.marked.carried = 1e12))), "cap:marked.carried");
    assert.equal(await reason(withPath((r) => (r.progression.attributes.strength = 21))), "cap:progression.attributes.strength");
    assert.equal(await reason(withPath((r) => (r.progression.attributes.strength = 9))), "cap:progression.attributes.strength");
    assert.equal(await reason(withPath((r) => (r.progression.proficiency.knife = 101))), "cap:progression.proficiency.knife");
    assert.equal(await reason(withPath((r) => (r.bossEquipment.shotgun.reserve = 99999))), "cap:bossEquipment.shotgun.reserve");
    assert.equal(await reason(withPath((r) => (r.flameFuel.fuelUnits = 10001))), "cap:flameFuel.fuelUnits");
    assert.equal(await reason(withPath((r) => (r.progression.awards = Array.from({ length: 201 }, () => ({}))))), "cap:progression.awards");
    assert.equal(await reason(withPath((r) => (r.vest.itemId = "x".repeat(201)))), "cap:vest.itemId");
    // A cap cannot be dodged by changing the JSON type of the value.
    assert.equal(await reason(withPath((r) => (r.hp = "1000000"))), "shape:type:hp");
    assert.equal(await reason(withPath((r) => (r.hp = true))), "shape:type:hp");
    assert.equal(await reason(withPath((r) => (r.marked.bank = "1e15"))), "shape:type:marked.bank");
    assert.equal(await reason(withPath((r) => (r.marked.bank = { n: 5 }))), "shape:type:marked.bank");
    assert.equal(await reason(withPath((r) => (r.pistol.reserve = [99999]))), "shape:type:pistol.reserve");
    assert.equal(await reason(withPath((r) => (r.progression.attributes.strength = "99"))), "shape:type:progression.attributes.strength");
    assert.equal(await reason(withPath((r) => (r.flameFuel.fuelUnits = "1e9"))), "shape:type:flameFuel.fuelUnits");
    assert.equal(await reason(withPath((r) => (r.progression.awards = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => ["k" + i, 1]))))), "shape:type:progression.awards");
    assert.equal(await reason(withPath((r) => (r.progression.awards = true))), "shape:type:progression.awards");
    assert.equal(await reason(withPath((r) => (r.supplies.pending[0].position.x = "1"))), "shape:type:supplies.pending[].position.x");
    // 'refused' carries the kind.
    assert.equal((await save(withPath((r) => (r.hp = 1e6)))).refused, "cap");
    assert.equal((await save(withPath((r) => (r.nope = 1)))).refused, "shape");
    // Depth and size.
    assert.equal(await reason(withPath((r) => (r.openingStory.a = { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } }))), "cap:record-depth");
    assert.equal(await reason(withPath((r) => (r.droneDeaths = Array.from({ length: 501 }, () => 1)))), "cap:droneDeaths");
    assert.equal(await reason(withPath((r) => (r.locker.junk = "x".repeat(70_000)))), "cap:record-size");
    // Fractional numbers are allowed only for world coordinates.
    assert.equal(await reason(withPath((r) => (r.supplies.pending[0].position.x = 1e9))), "cap:supplies.pending[].position.x");
    assert.equal(await reason(withPath((r) => (r.marked.bank = 2.5))), "shape:integer:marked.bank");
    assert.equal((await t.post("/arma/load_run", { character }, { as: ids.alice })).body.run, null, "no refusal stored anything");
    const fractional = await save(withPath((r) => (r.supplies.pending[0].position.x = 1.25)));
    assert.equal(fractional.revision, 1, "a fractional world coordinate is a valid save");
  } finally {
    await t.close();
  }
});

test("a real v18 record passes the check unchanged, and the record round-trips byte for byte", async () => {
  const t = await start();
  try {
    const { character } = (await t.post("/arma/create_character", { name: "Alice" }, { as: ids.alice })).body;
    assert.equal((await t.post("/arma/save_run", { character, era: 18, record: v18, revision: 0, seq: 1 }, { as: ids.alice })).body.revision, 1);
    assert.deepEqual((await t.post("/arma/load_run", { character }, { as: ids.alice })).body.run.record, v18);
    // The check itself is internal (no role is granted it), so ask as the database owner.
    await t.pg.exec("reset role");
    try {
      assert.equal((await call(t.pg, "select public.arma_check_record($1::jsonb) as r", [JSON.stringify(v18)]))[0].r, null);
    } finally {
      await t.pg.exec("set role arma_writer");
    }
  } finally {
    await t.close();
  }
});

test("rate limit: a per-account token bucket on save_run and load_run, refilled with time, one account never spends another's", async () => {
  let clock = 1_000_000;
  const t = await start({ limits: { save_run: { burst: 3, refillMs: 5000 }, load_run: { burst: 3, refillMs: 1000 } }, now: () => clock });
  try {
    const { character } = (await t.post("/arma/create_character", { name: "Alice" }, { as: ids.alice })).body;
    const save = (seq, as = ids.alice) => t.post("/arma/save_run", { character, era: 18, record: v18, revision: 0, seq }, { as });
    assert.deepEqual([(await save(1)).status, (await save(1)).status, (await save(1)).status], [200, 200, 200]);
    const limited = await save(1);
    assert.deepEqual([limited.status, limited.body.error, limited.body.retryMs], [429, "rate-limited", 5000]);
    clock += 2500;
    assert.equal((await save(1)).body.retryMs, 2500, "half a token is not enough");
    clock += 2500;
    assert.equal((await save(1)).status, 200, "one token is back after refillMs");
    assert.equal((await save(1)).status, 429);
    // Another account has its own bucket (bob gets a 403 from the database, which is after the limiter passed him).
    assert.equal((await save(1, ids.bob)).status, 403);
    // load_run has its own bucket and its own pace.
    for (let i = 0; i < 3; i++) assert.equal((await t.post("/arma/load_run", { character }, { as: ids.alice })).status, 200);
    assert.equal((await t.post("/arma/load_run", { character }, { as: ids.alice })).status, 429);
    clock += 1000;
    assert.equal((await t.post("/arma/load_run", { character }, { as: ids.alice })).status, 200);
    // Routes with no limit are untouched.
    assert.equal((await t.post("/arma/spawn_state", { instances: [] }, { as: ids.alice })).status, 200);
    assert.equal((await (await fetch(t.base + "/health")).json()).refused["rate-limited"] >= 3, true, "refusals are counted for /health");
  } finally {
    await t.close();
  }
});

test("status: GET /arma/status answers {enabled, open} to anyone and {allowed} to a valid token; a bad token is a 401; the kill switch reads as closed", async () => {
  let clock = 1_000_000;
  const t = await start({ now: () => clock });
  try {
    const get = async (headers = {}) => {
      const res = await fetch(t.base + "/arma/status", { headers });
      return { status: res.status, cache: res.headers.get("cache-control"), vary: res.headers.get("vary"), body: await res.json() };
    };
    const as = (id) => ({ Authorization: `Bearer user:${id}` });
    const anon = await get();
    assert.deepEqual([anon.status, anon.cache, anon.body], [200, "public, max-age=30", { enabled: true, open: false }], "no account, no `allowed`, nothing else; cacheable for 30 s");
    assert.equal(anon.vary, "Authorization", "a shared cache keys the public answer on the token header");
    const mine = await get(as(ids.alice));
    assert.deepEqual([mine.cache, mine.body], ["private, no-store", { enabled: true, open: false, allowed: true }], "an answer for a token is per account: never cached");
    assert.equal((await get({ Authorization: "Bearer forged" })).cache, "no-store", "errors are never cached");
    assert.deepEqual((await get(as(ids.carol))).body, { enabled: true, open: false, allowed: false }, "signed up, never granted access");
    assert.equal((await get({ Authorization: "Bearer forged" })).status, 401, "a token that is sent but not valid is not quietly downgraded to the anonymous answer");
    assert.equal((await get({ Authorization: "Basic abc" })).status, 401);
    await t.pg.exec("reset role"); // the database owner flips the switches, as Lead does
    try {
      await t.pg.exec("update public.arma_config set value = 'true'::jsonb where key = 'arma_open_access'");
      assert.deepEqual((await get(as(ids.carol))).body, { enabled: true, open: true, allowed: true }, "open access admits any account that exists");
      await t.pg.exec("update public.arma_config set value = 'false'::jsonb where key = 'arma_enabled'");
      assert.deepEqual((await get()).body, { enabled: true, open: false }, "the anonymous answer is memoised for 5 s: the writer does not read the database for every poll");
      clock += 6000;
      assert.deepEqual((await get()).body, { enabled: false, open: true }, "and it follows the switches after that");
      assert.deepEqual((await get(as(ids.alice))).body, { enabled: false, open: true, allowed: false }, "the kill switch closes it for everyone, the allow-list included");
      // A closed world refuses every WRITING client op with 403 O0007 (the page stops its save loop until the next status read) ...
      for (const [op, body] of [["create_character", { name: "Z" }], ["set_active", { character: "pc:x" }], ["save_run", { character: "pc:x", era: 18, record: v18, revision: 0, seq: 1 }], ["spawn_state", { instances: [] }]])
        assert.deepEqual(await t.post("/arma/" + op, body, { as: ids.alice }), { status: 403, body: { error: "O0007" } }, op);
      // ... but a READ, load_run, answers {run: null} (the same as "no run yet"): the page must not read that as "start fresh" while the status says closed.
      assert.deepEqual(await t.post("/arma/load_run", { character: "pc:x" }, { as: ids.alice }), { status: 200, body: { run: null } });
    } finally {
      await t.pg.exec("set role arma_writer");
    }
    assert.equal((await t.post("/arma/status", {}, { as: ids.alice })).status, 404, "POST is not a status route");
    assert.equal((await t.post("/internal/status", { account: ids.alice })).status, 401, "the internal status route needs the shared key");
    assert.equal((await t.post("/internal/status", { account: "not-a-uuid" }, { key: KEY })).status, 400);
    assert.equal((await t.post("/internal/status", {}, { key: KEY })).status, 400);
    const internal = await t.post("/internal/status", { account: ids.alice }, { key: KEY });
    assert.deepEqual([internal.status, internal.body.allowed], [200, false], "presence asks the same question; the kill switch is still on");
  } finally {
    await t.close();
  }
});

test("spawn engage: the world row comes from the server, not the phone", async () => {
  const t = await start();
  try {
    assert.equal((await t.post("/arma/spawn_engage", { instance: "wolf-1" }, { as: ids.alice })).body.error, "no-character");
    await t.post("/arma/create_character", { name: "Alice" }, { as: ids.alice });
    assert.equal((await t.post("/arma/spawn_engage", { instance: "ghost-9" }, { as: ids.alice })).status, 404);
    for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty"])
      assert.equal((await t.post("/arma/spawn_engage", { instance: name }, { as: ids.alice })).status, 404, name + " is an unknown spawn, not a prototype value");
    const engaged = await t.post("/arma/spawn_engage", { instance: "wolf-1", kind: "dragon", maxHp: 1 }, { as: ids.alice });
    assert.deepEqual([engaged.body.hp, engaged.body.maxHp, engaged.body.generation], [40, 40, 0], "the phone's kind and hp are ignored");
    assert.match(engaged.body.token, /^[A-Za-z0-9_-]{16,}$/);
    assert.equal((await t.post("/arma/spawn_engage", { instance: "wolf-1" }, { as: ids.alice })).body.token, engaged.body.token);
    const state = await t.post("/arma/spawn_state", { instances: ["wolf-1"] }, { as: ids.bob });
    assert.equal(state.body.spawns[0].hp, 40);
    // A signed-in account with no access row cannot read spawn hp either (carol has no arma_access row).
    assert.equal((await t.post("/arma/spawn_state", { instances: ["wolf-1"] }, { as: ids.carol })).status, 403);
  } finally {
    await t.close();
  }
});

test("internal routes need the shared key; presence reports location and batches hits", async () => {
  const t = await start();
  try {
    const { character } = (await t.post("/arma/create_character", { name: "Alice" }, { as: ids.alice })).body;
    const { body: eng } = await t.post("/arma/spawn_engage", { instance: "wolf-1" }, { as: ids.alice });
    assert.equal((await t.post("/internal/location", { account: ids.alice, area: "east", x: 10, z: 20 })).status, 401);
    assert.equal((await t.post("/internal/location", { account: ids.alice, area: "east", x: 10, z: 20 }, { key: "wrong-key" })).status, 401);
    assert.equal((await t.post("/arma/location", {}, { as: ids.alice })).status, 404, "a phone has no location route");
    const loc = await t.post("/internal/location", { account: ids.alice, area: "east", x: 10, z: 20, atMs: Date.now() - 1000 }, { key: KEY });
    assert.deepEqual(loc.body, { character, stored: true });
    await t.pg.exec("reset role");
    await t.pg.exec(`update public.arma_spawn_engages set last_hit_at = now() - interval '1 second' where token = '${eng.token}'`);
    await t.pg.exec("set role arma_writer");
    const hit = await t.post("/internal/hits", { batch: [{ account: ids.alice, token: eng.token, weapon: "knife", applied: 8, hits: 1, respawnS: 60 }] }, { key: KEY });
    assert.deepEqual([hit.status, hit.body[0].hp, hit.body[0].killed], [200, 32, false]);
    assert.equal((await t.post("/internal/hits", { batch: "nope" }, { key: KEY })).status, 400);
    assert.equal((await t.post("/internal/hits", { batch: Array(201).fill({}) }, { key: KEY })).status, 422, "the database refuses an oversized batch (O0002)");
    const stats = t.writer.stats();
    assert.deepEqual([stats.hitBatches, stats.hitRows, stats.locations], [2, 202, 1], "a malformed batch is refused before it is counted");
  } finally {
    await t.close();
  }
});

test("the service is OFF unless ARMA_WRITER=1", () => {
  const run = spawnSync(process.execPath, [new URL("../../writer/main.js", import.meta.url).pathname], { env: { PATH: process.env.PATH }, encoding: "utf8" });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /OFF/);
});
