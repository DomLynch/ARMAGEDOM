// Migration 000031: the daily board. A score is the cash the server credited that UTC day (the 000030 ledger); the ledger insert bumps the day's row in
// the same transaction as the save; arma_leaderboard answers the top 20 and the caller's own rank, to the writer only. Real migrations on pglite.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { call, failure, freshDb, ids, openFor } from "./helpers.js";

const v18 = JSON.parse(fs.readFileSync(new URL("../../../Web/tests/fixtures/navigation203-source202-v18.json", import.meta.url), "utf8"));
const award = (instance) => {
  const [areaId, placementKey] = instance.split(/:(.*)/s);
  return { areaId, placementKey, weaponId: "knife" };
};

async function setup() {
  const db = await freshDb();
  await openFor(db, ids.alice, ids.bob);
  const players = {};
  for (const [name, account] of [["alice", ids.alice], ["bob", ids.bob]]) {
    const [{ id }] = await call(db, "select public.arma_create_character($1, $2) as id", [account, name]);
    players[name] = { account, character: id, revision: 0, seq: 0 };
  }
  // A save of the fixture with these awards (the credit is what the board counts; the money is left at zero so no clamp is in play).
  const save = async (name, instances) => {
    const p = players[name];
    const record = { ...v18, progression: { ...v18.progression, awards: instances.map(award) }, marked: { ...v18.marked, carried: 0, bank: 0 } };
    const r = (await call(db, "select public.arma_save_run($1, $2, 18, $3::jsonb, $4, $5) as r", [p.account, p.character, JSON.stringify(record), p.revision, ++p.seq]))[0].r;
    if (r.revision) p.revision = r.revision;
    return r;
  };
  const board = async (account) => (await call(db, "select public.arma_leaderboard($1) as r", [account]))[0].r;
  return { db, players, save, board };
}

test("a save's credits raise the day's score and kills in the same transaction; the board ranks them", async () => {
  const { db, save, board } = await setup();
  const empty = await board(ids.alice);
  assert.deepEqual([empty.top, empty.me], [[], null]);
  await save("alice", ["westminster:westminster-roamer-1", "westminster:boss-witch-v1"]);
  await save("bob", ["south:south-roamer-1"]);
  const b = await board(ids.bob);
  assert.deepEqual(b.top, [{ account: ids.alice, rank: 1, score: 300, kills: 2 }, { account: ids.bob, rank: 2, score: 100, kills: 1 }]);
  assert.deepEqual(b.me, { rank: 2, score: 100, kills: 1 });
  assert.equal(b.day, (await call(db, "select (now() at time zone 'utc')::date::text as d"))[0].d);
  // More kills in a later save add to the same row.
  await save("bob", ["south:south-roamer-1", "south:south-roamer-2", "south:boss-nightborn-v1"]);
  assert.deepEqual((await board(ids.bob)).me, { rank: 1, score: 400, kills: 3 });
  // The score is exactly the day's ledger.
  const sums = await call(db, "select account, sum(cash)::int as score, count(*)::int as kills from public.arma_award_credits group by account order by account");
  const rows = await call(db, "select account, score, kills from public.arma_daily_scores order by account");
  assert.deepEqual(rows, sums);
});

test("ties share a rank, the board stops at 20, and a player below it still gets an own rank", async () => {
  const { db, save, board } = await setup();
  await save("alice", ["westminster:westminster-roamer-1"]);
  await save("bob", ["south:south-roamer-1"]);
  const tied = await board(ids.alice);
  assert.deepEqual(tied.top.map((r) => r.rank), [1, 1]);
  assert.equal(tied.me.rank, 1);
  // 25 other accounts with more cash today push Alice and Bob below the top 20.
  await db.exec(`insert into public.arma_daily_scores (day, account, score, kills)
    select (now() at time zone 'utc')::date, ('10000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 1000 + n, 5 from generate_series(1, 25) n`);
  const full = await board(ids.alice);
  assert.equal(full.top.length, 20);
  assert.deepEqual([full.top[0].rank, full.top[0].score, full.top[19].rank, full.top[19].score], [1, 1025, 20, 1006]);
  assert.ok(full.top.every((r) => r.account !== ids.alice && r.account !== ids.bob));
  assert.deepEqual(full.me, { rank: 26, score: 100, kills: 1 }, "25 players are ahead; Bob shares the rank");
});

test("yesterday's credits and a zero score are not on today's board", async () => {
  const { db, save, board } = await setup();
  await save("alice", ["westminster:westminster-roamer-1"]);
  await db.exec(`insert into public.arma_award_credits (character, account, instance, cash, at)
    select character, account, instance, cash, at - interval '1 day' from public.arma_award_credits`);
  const days = await call(db, "select count(*)::int as n from public.arma_daily_scores");
  assert.equal(days[0].n, 2, "one row per account per day");
  assert.deepEqual((await board(ids.alice)).me, { rank: 1, score: 100, kills: 1 }, "only today counts");
  await db.exec(`insert into public.arma_daily_scores (day, account, score, kills) values ((now() at time zone 'utc')::date, '${ids.bob}', 0, 0)`);
  assert.equal((await board(ids.bob)).me, null);
  assert.equal((await board(ids.bob)).top.length, 1);
});

test("the board is for the writer only: no client, no presence, no account without access", async () => {
  const { db, board } = await setup();
  assert.equal((await failure(board(ids.carol)))?.code, "O0007", "an account without access");
  for (const role of ["anon", "authenticated", "arma_presence"]) {
    await db.exec(`set role ${role}`);
    try {
      assert.equal((await failure(call(db, "select public.arma_leaderboard($1)", [ids.alice])))?.code, "42501", role);
      assert.equal((await failure(call(db, "select * from public.arma_daily_scores")))?.code, "42501", `${role} reads the table`);
    } finally {
      await db.exec("reset role");
    }
  }
  await db.exec("set role arma_writer");
  try {
    assert.equal((await call(db, "select public.arma_leaderboard($1) as r", [ids.alice]))[0].r.top.length, 0);
    assert.equal((await failure(call(db, "select * from public.arma_daily_scores")))?.code, "42501", "the writer calls the function, it does not read the table");
  } finally {
    await db.exec("reset role");
  }
});
