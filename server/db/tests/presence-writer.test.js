// The contract between presence and the writer, over real HTTP on 127.0.0.1 and the real migrations on pglite (queried AS arma_writer):
// the rows presence builds (account, token, weapon, applied, hits) are exactly what /internal/hits takes, and what comes back is what
// presence reads (token, applied, hp, maxHp, killed, error). Nothing leaves the machine.
import test from "node:test";
import assert from "node:assert/strict";
import { freshDb, ids, openFor } from "./helpers.js";
import { createWriter, spawnRowsFrom } from "../../writer/writer.js";
import { writerClient } from "../../presence/writer-client.js";

const KEY = "internal-key-for-tests";

async function start() {
  const pg = await freshDb();
  await openFor(pg, ids.alice, ids.bob);
  await pg.exec(`insert into public.arma_weapon_rules values ('knife', 10, 4); insert into public.arma_loot_rules values ('wolf', 0, 'wolf-pelt', 1);`);
  await pg.exec("set role arma_writer");
  const db = { query: async (sql, params) => (await pg.query(sql, params)).rows };
  const verify = async (token) => (token.startsWith("user:") ? token.slice(5) : null);
  const writer = createWriter({ db, verify, spawnRows: spawnRowsFrom({ "wolf-1": { kind: "wolf", area: "east", maxHp: 40 } }), internalKey: KEY });
  await new Promise((resolve) => writer.server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${writer.server.address().port}`;
  const phone = async (op, body, as) => (await fetch(`${baseUrl}/arma/${op}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer user:${as}` }, body: JSON.stringify(body) })).json();
  return { pg, baseUrl, phone, client: writerClient({ baseUrl, key: KEY }), close: () => new Promise((resolve) => writer.server.close(resolve)) };
}

test("presence rows go through writerClient to the shared bar; a refused row is reported in its own slot", async () => {
  const t = await start();
  try {
    await t.phone("create_character", { name: "Alice" }, ids.alice);
    await t.phone("create_character", { name: "Bob" }, ids.bob);
    const alice = await t.phone("spawn_engage", { instance: "wolf-1" }, ids.alice);
    const bob = await t.phone("spawn_engage", { instance: "wolf-1" }, ids.bob);
    const results = await t.client.sendHits([
      { account: ids.alice, token: alice.token, weapon: "knife", applied: 10, hits: 1 },
      { account: ids.bob, token: bob.token, weapon: "knife", applied: 10, hits: 1 },
      { account: ids.bob, token: "no-such-token-0000000", weapon: "knife", applied: 10, hits: 1 },
    ]);
    assert.equal(results.length, 3, "one result per row, in order");
    assert.deepEqual(results.slice(0, 2).map((r) => [r.token, r.applied, r.hp, r.maxHp, r.killed]), [[alice.token, 10, 30, 40, false], [bob.token, 10, 20, 40, false]], "bob sees the bar alice lowered");
    assert.equal(results[2].error, "O0009", "an unknown token is an error in its own slot");
  } finally {
    await t.close();
  }
});

test("writerClient: the shared key is required, a refusal or a dead writer throws", async () => {
  const t = await start();
  try {
    assert.throws(() => writerClient({ baseUrl: t.baseUrl }), /required/);
    await assert.rejects(writerClient({ baseUrl: t.baseUrl, key: "wrong-key" }).sendHits([]), /401/);
    await t.close();
    await assert.rejects(writerClient({ baseUrl: t.baseUrl, key: KEY, timeoutMs: 500 }).sendHits([]));
  } finally {
    await t.close().catch(() => {});
  }
});

test("writerClient: a location report is stored for the active character", async () => {
  const t = await start();
  try {
    const { character } = await t.phone("create_character", { name: "Alice" }, ids.alice);
    const stored = await t.client.sendLocation({ account: ids.alice, area: "east", x: 3500, z: 1500, atMs: Date.now() - 1000 });
    assert.deepEqual(stored, { character, stored: true });
  } finally {
    await t.close();
  }
});
