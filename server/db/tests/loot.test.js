// A2 PR 3a: loot rules are keyed by spawn INSTANCE and seeded with the always-drop weapons (migration 000009). Real migrations on pglite.
import test from "node:test";
import assert from "node:assert/strict";
import { as, call, failure, freshDb, ids, openFor } from "./helpers.js";

async function setup() {
  const db = await freshDb();
  await openFor(db, ids.alice, ids.bob);
  const alice = (await call(db, "select public.arma_create_character($1, 'Alice') as id", [ids.alice]))[0].id;
  const bob = (await call(db, "select public.arma_create_character($1, 'Bob') as id", [ids.bob]))[0].id;
  await db.exec(`delete from public.arma_weapon_rules; insert into public.arma_weapon_rules values ('knife', 10, 4);`); // the seeded loot rules stay
  // Kill a 10 hp creature with one knife hit. The kind is the writer's own (the phone never names it).
  const kill = async (who, character, instance, kind, area) => {
    const token = `token-${who}-${instance.replace(/[^a-z0-9]/g, "")}-aaaa`;
    await call(db, "select public.arma_spawn_engage($1, $2, $3, $4, $5, $6, 10)", [ids[who], character, token, instance, kind, area]);
    await db.exec(`update public.arma_spawn_engages set last_hit_at = now() - interval '1 second' where token = '${token}'`);
    return (await call(db, "select public.arma_spawn_hit($1, $2, 'knife', 10, 1, 60) as r", [ids[who], token]))[0].r;
  };
  return { db, alice, bob, kill };
}
const looted = (db) => call(db, "select account, item, instance, mint_key from public.arma_loot order by item");

test("the seeded rules are the eight always-drop weapons, keyed by the instance that drops them", async () => {
  const { db } = await setup();
  const rules = await call(db, "select kind, slot, item, chance::float8 as chance from public.arma_loot_rules order by kind");
  assert.equal(rules.length, 8);
  assert.ok(rules.every((r) => r.slot === 0 && r.chance === 1), "each is one always-drop slot");
  const byKey = Object.fromEntries(rules.map((r) => [r.kind, r.item]));
  assert.equal(byKey["east:east-roamer-2"], "hale-pitborn-cleaver-v1", "a unique drop of an ordinary scavenger placement");
  assert.equal(byKey["east-bridge:boss-warden-v1"], "bridge-warden-rifle-v1");
  assert.ok(rules.every((r) => /^[a-z0-9-]+:[a-z0-9-]+$/.test(r.kind)), "area:placement keys");
});

test("a kill mints the weapon of THAT instance and one creature kind shared by other placements mints nothing", async () => {
  const { db, alice, kill } = await setup();
  // Hale is a plain 'hollow-scavenger' like four other roamers, yet only he drops the cleaver.
  assert.equal((await kill("alice", alice, "westminster:westminster-roamer-1", "hollow-scavenger", "westminster")).minted, 0, "same kind, no drop");
  assert.deepEqual(await looted(db), []);
  const hale = await kill("alice", alice, "east:east-roamer-2", "hollow-scavenger", "east");
  assert.deepEqual([hale.killed, hale.minted], [true, 1]);
  assert.deepEqual((await looted(db)).map((l) => [l.account, l.item, l.instance, l.mint_key]), [[ids.alice, "hale-pitborn-cleaver-v1", "east:east-roamer-2", `kill:east:east-roamer-2:0:${ids.alice}:0`]]);
  // The bridge warden drops the rifle (a boss kind, no other placement uses it).
  assert.equal((await kill("alice", alice, "east-bridge:boss-warden-v1", "boss-warden", "east-bridge")).minted, 1);
  assert.deepEqual((await looted(db)).map((l) => l.item), ["bridge-warden-rifle-v1", "hale-pitborn-cleaver-v1"]);
});

test("loot is minted once: the settle cannot run twice, and a second killer in the same death is paid their own copy", async () => {
  const { db, alice, bob, kill } = await setup();
  assert.equal((await kill("alice", alice, "south:boss-nightborn-v1", "boss-nightborn", "south")).minted, 1);
  assert.equal((await failure(call(db, "select public.arma_spawn_hit($1, $2, 'knife', 10, 1, 60)", [ids.alice, `token-alice-southbossnightbornv1-aaaa`])))?.code, "O0009", "the token closed with the death");
  assert.equal((await call(db, "select count(*)::int as n from public.arma_loot"))[0].n, 1);
  // Two contributors to one death each get their own mint (shares come from applied damage, unchanged).
  const token = (who) => `token-${who}-shared-aaaaaaaaaaaa`;
  for (const [who, character] of [["alice", alice], ["bob", bob]]) await call(db, "select public.arma_spawn_engage($1, $2, $3, 'lambeth:boss-surgeon-v1', 'boss-surgeon', 'lambeth', 20)", [ids[who], character, token(who)]);
  for (const who of ["alice", "bob"]) await db.exec(`update public.arma_spawn_engages set last_hit_at = now() - interval '1 second' where token = '${token(who)}'`);
  await call(db, "select public.arma_spawn_hit($1, $2, 'knife', 10, 1, 60)", [ids.alice, token("alice")]);
  const last = (await call(db, "select public.arma_spawn_hit($1, $2, 'knife', 10, 1, 60) as r", [ids.bob, token("bob")]))[0].r;
  assert.deepEqual([last.killed, last.paid, last.minted], [true, 2, 2]);
  assert.deepEqual((await looted(db)).filter((l) => l.item === "surgeons-knife-v1").map((l) => l.account).sort(), [ids.alice, ids.bob].sort());
});

test("a phone cannot choose the loot: the instance is pinned to the world row, so a different kind or area is refused", async () => {
  const { db, alice, kill } = await setup();
  await kill("alice", alice, "westminster:westminster-roamer-2", "giant-salamander", "westminster");
  const engage = (instance, kind, area) => failure(call(db, "select public.arma_spawn_engage($1, $2, 'token-pin-aaaaaaaaaaaaaaaa', $3, $4, $5, 10)", [ids.alice, alice, instance, kind, area]));
  assert.equal((await engage("westminster:westminster-roamer-2", "boss-warden", "westminster"))?.code, "O0002", "an existing instance cannot be relabelled to a boss kind");
  assert.equal((await engage("westminster:westminster-roamer-2", "giant-salamander", "east"))?.code, "O0002", "nor moved to another area");
  // The loot rows are not reachable by any client role.
  assert.match((await as(db, "authenticated", ids.alice, () => failure(call(db, "select * from public.arma_loot_rules"))))?.message ?? "NO ERROR", /permission denied/);
});
