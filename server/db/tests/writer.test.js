// The writer service over real HTTP on 127.0.0.1, with the database being the real migrations on pglite, queried AS the role arma_writer
// (so a missing grant fails here exactly as it would on Supabase). Tokens are faked ("user:<uuid>"); nothing leaves the machine.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { call, freshDb, ids, openFor } from "./helpers.js";
import { createWriter } from "../../writer/writer.js";

const v18 = JSON.parse(fs.readFileSync(new URL("../../../Web/tests/fixtures/navigation203-source202-v18.json", import.meta.url), "utf8"));
const KEY = "internal-key-for-tests";
const spawns = { "wolf-1": { kind: "wolf", area: "east", maxHp: 40 } };

async function start() {
  const pg = await freshDb();
  await openFor(pg, ids.alice, ids.bob);
  await pg.exec(`insert into public.arma_weapon_rules values ('knife', 10, 4); insert into public.arma_loot_rules values ('wolf', 0, 'wolf-pelt', 1);`);
  await pg.exec("set role arma_writer");
  const db = { query: async (sql, params) => (await pg.query(sql, params)).rows };
  const verify = async (token) => (token.startsWith("user:") ? token.slice(5) : null);
  const writer = createWriter({ db, verify, spawnRows: (i) => spawns[i] ?? null, internalKey: KEY });
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
    assert.equal((await t.post("/arma/save_run", { character, era: 18, record: v18, revision: 0 }, { as: ids.alice })).body.revision, 1);
    assert.deepEqual((await t.post("/arma/save_run", { character, era: 18, record: v18, revision: 0 }, { as: ids.alice })).body.refused, "stale");
    assert.equal((await t.post("/arma/save_run", { character, era: 18, record: v18, revision: "x" }, { as: ids.alice })).status, 400);
    const run = (await t.post("/arma/load_run", { character }, { as: ids.alice })).body.run;
    assert.deepEqual([run.era, run.revision, run.record.hp], [18, 1, v18.hp]);
    // Not Bob's character: the database refuses with O0007, which the writer reports as 403.
    assert.equal((await t.post("/arma/save_run", { character, era: 18, record: v18, revision: 1 }, { as: ids.bob })).status, 403);
    assert.equal((await t.post("/arma/create_character", { name: "Eve" }, { as: ids.carol })).status, 403, "an account without access");
  } finally {
    await t.close();
  }
});

test("requests for one account run one at a time: two racing saves cannot both win", async () => {
  const t = await start();
  try {
    const { character } = (await t.post("/arma/create_character", { name: "Alice" }, { as: ids.alice })).body;
    const results = await Promise.all(Array.from({ length: 6 }, () => t.post("/arma/save_run", { character, era: 18, record: v18, revision: 0 }, { as: ids.alice })));
    assert.equal(results.filter((r) => r.body.savedAt !== undefined).length, 1, "exactly one save was stored");
    assert.equal(results.filter((r) => r.body.refused === "stale").length, 5);
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
    const engaged = await t.post("/arma/spawn_engage", { instance: "wolf-1", kind: "dragon", maxHp: 1 }, { as: ids.alice });
    assert.deepEqual([engaged.body.hp, engaged.body.maxHp, engaged.body.generation], [40, 40, 0], "the phone's kind and hp are ignored");
    assert.match(engaged.body.token, /^[A-Za-z0-9_-]{16,}$/);
    assert.equal((await t.post("/arma/spawn_engage", { instance: "wolf-1" }, { as: ids.alice })).body.token, engaged.body.token);
    const state = await t.post("/arma/spawn_state", { instances: ["wolf-1"] }, { as: ids.bob });
    assert.equal(state.body.spawns[0].hp, 40);
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
