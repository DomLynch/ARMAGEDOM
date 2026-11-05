// Migration 000030: kill cash online. progression.awards of the record being saved, diffed against the stored record, pay arma_placement_cash into
// arma_cash.earned before the clamp, through a per-account rolling window, and each credit is a ledger row. Real migrations on pglite.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { call, failure, freshDb, ids, openFor } from "./helpers.js";

const v18 = JSON.parse(fs.readFileSync(new URL("../../../Web/tests/fixtures/navigation203-source202-v18.json", import.meta.url), "utf8"));
const award = (instance) => {
  const [areaId, placementKey] = instance.split(/:(.*)/s);
  return { areaId, placementKey, weaponId: "knife" };
};
const ROAMERS = ["westminster:westminster-roamer-1", "westminster:westminster-roamer-2", "westminster:westminster-roamer-3", "westminster:westminster-roamer-4"];
const BOSS = "westminster:boss-witch-v1";
const recordWith = (awards, carried = 0, bank = 0) => ({
  ...v18,
  progression: { ...v18.progression, awards: awards.map((a) => (typeof a === "string" ? award(a) : a)) },
  marked: { ...v18.marked, carried, bank },
});

async function setup() {
  const db = await freshDb();
  await openFor(db, ids.alice, ids.bob);
  const [{ id: character }] = await call(db, "select public.arma_create_character($1, 'Alice') as id", [ids.alice]);
  let seq = 0,
    revision = 0;
  // Save the fixture with exactly these awards and this money (a fresh seq each time); the revision advances only when the save was applied.
  const save = async (awards, carried = 0, bank = 0) => {
    const r = (await call(db, "select public.arma_save_run($1, $2, 18, $3::jsonb, $4, $5) as r", [ids.alice, character, JSON.stringify(recordWith(awards, carried, bank)), revision, ++seq]))[0].r;
    if (r.revision && !r.replayed) revision = r.revision;
    return r;
  };
  const earned = async () => (await call(db, "select coalesce((select earned from public.arma_cash where character = $1), 0)::int as n", [character]))[0].n;
  const ledger = () => call(db, "select instance, cash from public.arma_award_credits where character = $1 order by id", [character]);
  const stored = async () => (await call(db, "select public.arma_load_run($1, $2) as r", [ids.alice, character]))[0].r?.record;
  return { db, character, save, earned, ledger, stored };
}

test("the seed: 78 placements, 7 bosses at 200 and the rest at 100", async () => {
  const db = await freshDb();
  const rows = await call(db, "select count(*)::int as n, sum(cash)::int as total, (count(*) filter (where cash = 200))::int as bosses from public.arma_placement_cash");
  assert.deepEqual(rows[0], { n: 78, total: 71 * 100 + 7 * 200, bosses: 7 });
});

test("a new award is credited once, a boss pays 200, the ledger has a row each, and the clamp sees the cash", async () => {
  const { save, earned, ledger, stored } = await setup();
  const first = await save(ROAMERS.slice(0, 2), 200, 0);
  assert.deepEqual([first.awarded, first.clamped, first.awardCapped], [200, undefined, undefined]);
  assert.equal(await earned(), 200);
  // The same awards again: stored equals sent, nothing is credited.
  const same = await save(ROAMERS.slice(0, 2), 200, 0);
  assert.deepEqual([same.awarded, same.clamped], [undefined, undefined]);
  // One roamer and a boss: 100 + 200, so carried may now hold 500.
  const more = await save([...ROAMERS.slice(0, 3), BOSS], 500, 0);
  assert.deepEqual([more.awarded, more.clamped], [300, undefined]);
  assert.equal(await earned(), 500);
  assert.deepEqual((await ledger()).map((row) => row.cash), [100, 100, 200, 100], "the boss first within a save, then in save order");
  assert.equal((await stored()).marked.carried, 500);
  // One coin more than was earned is still clamped.
  const over = await save([...ROAMERS.slice(0, 3), BOSS], 501, 0);
  assert.deepEqual([over.clamped, over.carried], [true, 500]);
});

test("an unknown placement, a duplicate and a malformed row credit nothing extra; awards that are not a list never throw", async () => {
  const { db, character, save, earned, ledger } = await setup();
  const r = await save(["westminster:nowhere-1", ROAMERS[0], ROAMERS[0], { areaId: "westminster" }, { placementKey: "x" }, "south:south-roamer-1"], 200, 0);
  assert.equal(r.awarded, 200, "the two real placements, once each");
  assert.equal(r.clamped, undefined);
  assert.deepEqual((await ledger()).map((l) => l.instance).sort(), [ROAMERS[0], "south:south-roamer-1"].sort());
  assert.equal(await earned(), 200);
  const odd = { ...recordWith([], 200, 0), progression: { ...v18.progression, awards: "none" } };
  const result = (await call(db, "select public.arma_save_run($1, $2, 18, $3::jsonb, 1, 50) as r", [ids.alice, character, JSON.stringify(odd)]))[0].r;
  assert.equal(result.awarded, undefined);
  assert.equal(await earned(), 200);
});

test("a retry of the same save replays the answer and credits once", async () => {
  const { db, character, earned, ledger } = await setup();
  const record = JSON.stringify(recordWith(ROAMERS.slice(0, 2), 200, 0));
  const send = async () => (await call(db, "select public.arma_save_run($1, $2, 18, $3::jsonb, 0, 7) as r", [ids.alice, character, record]))[0].r;
  const first = await send();
  assert.equal(first.awarded, 200);
  assert.deepEqual(await send(), { ...first, replayed: true });
  assert.equal(await earned(), 200);
  assert.equal((await ledger()).length, 2);
});

test("a burst of new awards in one save is credited in full: there is no per-minute cap", async () => {
  const { db, save, earned } = await setup();
  const rows = await call(db, "select instance from public.arma_placement_cash where cash = 100 order by instance limit 20");
  const burst = rows.map((r) => r.instance);
  assert.equal(burst.length, 20);
  const r = await save(burst, 2000, 0);
  assert.deepEqual([r.awarded, r.awardCapped, r.clamped], [2000, undefined, undefined]);
  assert.equal(await earned(), 2000);
});

test("the hourly window caps credits per account (120 by default, 6 here), and the hour reopens it", async () => {
  const { db, save, earned, ledger } = await setup();
  await db.exec("update public.arma_world_config set kills_per_hour = 6");
  const eight = [...ROAMERS, "westminster:westminster-roamer-6", "westminster:westminster-roamer-7", "westminster:westminster-roamer-8", "south:south-roamer-1"].slice(0, 8);
  const capped = await save(eight, 600, 0);
  assert.deepEqual([capped.awarded, capped.awardCapped], [600, 2], "6 credited, 2 dropped by the cap");
  assert.equal(await earned(), 600);
  // The two dropped awards are in the stored record now, so they are not offered again.
  const again = await save(eight, 600, 0);
  assert.deepEqual([again.awarded, again.awardCapped], [undefined, undefined]);
  // A boss in the same hour: the window is full.
  const full = await save([...eight, BOSS], 600, 0);
  assert.deepEqual([full.awarded, full.awardCapped, full.clamped], [undefined, 1, undefined]);
  // Two minutes later the hour is still full.
  await db.exec("update public.arma_award_credits set at = now() - interval '2 minutes'");
  assert.equal((await save([...eight, BOSS, "area7:boss-knight-v1"], 600, 0)).awardCapped, 1);
  // Two hours later the window has room again. The first boss was dropped and stored; a boss not seen yet is new.
  await db.exec("update public.arma_award_credits set at = now() - interval '2 hours'");
  const later = await save([...eight, BOSS, "area7:boss-knight-v1", "area8:boss-veteran-v1"], 800, 0);
  assert.deepEqual([later.awarded, later.awardCapped], [200, undefined]);
  assert.equal(await earned(), 800);
  assert.equal((await ledger()).length, 7);
});

test("the cap is per account, across its characters", async () => {
  const { db, save } = await setup();
  await db.exec("update public.arma_world_config set kills_per_hour = 6");
  assert.equal((await save([...ROAMERS, "westminster:westminster-roamer-6", "westminster:westminster-roamer-7", "westminster:westminster-roamer-8"], 600, 0)).awardCapped, 1);
  const firstSave = async (account, name) => {
    const [{ id }] = await call(db, "select public.arma_create_character($1, $2) as id", [account, name]);
    return (await call(db, "select public.arma_save_run($1, $2, 18, $3::jsonb, 0, 1) as r", [account, id, JSON.stringify(recordWith(["south:south-roamer-2"]))]))[0].r;
  };
  const second = await firstSave(ids.alice, "Second");
  assert.deepEqual([second.awarded, second.awardCapped], [undefined, 1], "the same account has no room left this hour");
  assert.equal((await firstSave(ids.bob, "Bob")).awarded, 100, "another account is not affected");
});

test("a retry that resets the awards starts counting again; toggling awards on and off is bounded by the window", async () => {
  const { db, save, earned } = await setup();
  await db.exec("update public.arma_world_config set kills_per_hour = 6");
  assert.equal((await save(ROAMERS.slice(0, 2), 200, 0)).awarded, 200);
  assert.equal((await save([], 200, 0)).awarded, undefined, "a retry resets the awards: nothing to credit");
  assert.equal((await save(ROAMERS.slice(0, 2), 400, 0)).awarded, 200, "killed again in the next life: paid again");
  assert.equal(await earned(), 400);
  // The forged version of the same thing: farming by toggling the awards stops when the window is full (6 an hour here, 4 already used).
  let farmed = 0;
  for (let i = 0; i < 6; i++) {
    await save([], 0, 0);
    farmed += (await save(ROAMERS, 0, 0)).awarded ?? 0;
  }
  assert.equal(farmed, 200);
  assert.equal(await earned(), 600);
});

test("with enforce_cash off the credit and the ledger still run, and a save without awards is unchanged", async () => {
  const { db, save, earned, ledger } = await setup();
  await db.exec("update public.arma_config set value = 'false'::jsonb where key = 'enforce_cash'");
  const r = await save(ROAMERS.slice(0, 1), 5000, 0);
  assert.deepEqual([r.awarded, r.clamped], [100, undefined]);
  assert.equal(await earned(), 100);
  assert.equal((await ledger()).length, 1);
  const plain = await save([], 5000, 0);
  assert.deepEqual([plain.awarded, plain.revision], [undefined, 2]);
});

test("a refused save credits nothing, and the helper is not callable by the writer, presence or a client", async () => {
  const { db, character, save, earned } = await setup();
  assert.equal((await save(ROAMERS.slice(0, 1), 100, 0)).awarded, 100);
  const stale = (await call(db, "select public.arma_save_run($1, $2, 18, $3::jsonb, 0, 99) as r", [ids.alice, character, JSON.stringify(recordWith(ROAMERS))]))[0].r;
  assert.equal(stale.refused, "stale");
  assert.equal(await earned(), 100);
  for (const role of ["arma_writer", "arma_presence", "anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      assert.equal((await failure(call(db, "select public.arma_credit_awards($1, $2, null, '{}'::jsonb)", [ids.alice, character])))?.code, "42501", role);
    } finally {
      await db.exec("reset role");
    }
  }
});

test("the down files (31, then 30) put the 000029 save back and drop the tables, leaving the cash that was earned", async () => {
  const { db, save, earned } = await setup();
  assert.equal((await save(ROAMERS.slice(0, 2), 200, 0)).awarded, 200);
  for (const file of ["20261105000031_arma_daily_scores_down.sql", "20261105000030_arma_award_credit_down.sql"])
    await db.exec(fs.readFileSync(new URL(`../../../supabase/down/${file}`, import.meta.url), "utf8"));
  for (const table of ["arma_award_credits", "arma_placement_cash", "arma_daily_scores"])
    assert.equal((await call(db, `select to_regclass('public.${table}') is null as gone`))[0].gone, true, table);
  assert.equal(await earned(), 200, "the cash players were paid stays");
  const after = await save(ROAMERS, 200, 0);
  assert.deepEqual([after.awarded, after.clamped], [undefined, undefined], "000029 behaviour: no credit, and 200 is inside the ceiling");
  assert.equal((await save(ROAMERS, 201, 0)).clamped, true);
});
