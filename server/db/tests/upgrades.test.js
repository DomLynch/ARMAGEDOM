// Permanent safehouse upgrades (migration 20261105000032): the seeded defs, the buy with replay and the cash ceiling, the refusals, the lock-down and the
// down file's refund. Real migrations on pglite, like market.test.js.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { as, call, failure, freshDb, ids, openFor } from "./helpers.js";

const fixture = JSON.parse(fs.readFileSync(new URL("../../../Web/tests/fixtures/navigation203-source202-v18.json", import.meta.url), "utf8"));
const v18 = { ...fixture, progression: { ...fixture.progression, awards: [] } }; // awards now credit cash on save (migration 30): these tests do not want that
const down = fs.readFileSync(new URL("../../../supabase/down/20261105000032_arma_safehouse_upgrades_down.sql", import.meta.url), "utf8");

async function setup() {
  const db = await freshDb();
  await openFor(db, ids.alice, ids.bob);
  const [{ id: alice }] = await call(db, "select public.arma_create_character($1, 'Alice') as id", [ids.alice]);
  const [{ id: bob }] = await call(db, "select public.arma_create_character($1, 'Bob') as id", [ids.bob]);
  const q = async (sql, params) => (await call(db, sql, params))[0].r;
  const buy = (account, character, upgrade, level, req) => q("select public.arma_upgrade_buy($1, $2, $3, $4, $5) as r", [account, character, upgrade, level, req]);
  const get = (account, character) => q("select public.arma_upgrades_get($1, $2) as r", [account, character]);
  const cash = async (character) => (await call(db, "select earned, spent from public.arma_cash where character = $1", [character]))[0] ?? { earned: 0, spent: 0 };
  const earn = (character, n) => db.exec(`insert into public.arma_cash (character, earned) values ('${character}', ${n}) on conflict (character) do update set earned = public.arma_cash.earned + ${n}`);
  const save = (account, character, rev, seq, carried, bank = 0) =>
    q("select public.arma_save_run($1, $2, 18, $3::jsonb, $4, $5) as r", [account, character, JSON.stringify({ ...v18, marked: { ...v18.marked, carried, bank } }), rev, seq]);
  const run = async (character) => (await call(db, "select record #>> '{marked,carried}' as carried, record #>> '{marked,bank}' as bank, revision from public.arma_runs where character = $1", [character]))[0];
  return { db, alice, bob, buy, get, cash, earn, save, run };
}

test("the seeded defs: three upgrades, one price per level, in the order a player buys them", async () => {
  const { db } = await setup();
  const rows = await call(db, "select id, max_level, price from public.arma_upgrade_defs order by id");
  assert.deepEqual(rows.map((r) => r.id), ["dodge-recovery", "reserve-magazine", "stamina"]);
  for (const row of rows) {
    assert.equal(row.price.length, row.max_level, row.id);
    assert.ok(row.price.every((p, i) => p > 0 && (i === 0 || p > row.price[i - 1])), `${row.id} gets dearer with every level`);
  }
});

test("the defs refuse a price list that does not match max_level, a null or a free level", async () => {
  const { db } = await setup();
  for (const [sql, why] of [
    ["insert into public.arma_upgrade_defs values ('x-one', 2, array[10])", "one price for two levels"],
    ["insert into public.arma_upgrade_defs values ('x-two', 2, array[10, null])", "a null price"],
    ["insert into public.arma_upgrade_defs values ('x-three', 1, array[0])", "a free level"],
    ["insert into public.arma_upgrade_defs values ('Bad Id', 1, array[5])", "a bad id"],
  ])
    assert.ok(await failure(call(db, sql)), why);
});

test("buy: debits cash, writes the level, answers the contract shape, and the cash ceiling falls with it", async () => {
  const { alice, buy, get, earn, cash, save, run } = await setup();
  await earn(alice, 1000);
  await save(ids.alice, alice, 0, 1, 700, 100);
  assert.deepEqual(await get(ids.alice, alice), { upgrades: [], cash: 700, bank: 100, ceiling: 1000 });
  const r = await buy(ids.alice, alice, "stamina", 1, "upg-aaaa-0001");
  assert.deepEqual([r.ok, r.upgrade, r.level, r.delta, r.cash, r.bank, r.ceiling, r.replayed], [true, "stamina", 1, -300, 400, 100, 700, false]);
  assert.deepEqual(r.upgrades, [{ upgrade_id: "stamina", level: 1 }]);
  assert.equal((await cash(alice)).spent, 300);
  const stored = await run(alice);
  assert.deepEqual([stored.carried, stored.bank, stored.revision], ["400", "100", 1], "the stored record follows the debit without a revision bump");
  // the phone saves its OLD richer record: clamped to the lower ceiling
  const s = await save(ids.alice, alice, 1, 2, 700, 100);
  assert.deepEqual([s.clamped, s.carried, s.bank], [true, 600, 100]);
  // level two comes out of carried first, then the bank
  const second = await buy(ids.alice, alice, "stamina", 2, "upg-aaaa-0002");
  assert.deepEqual([second.ok, second.delta, second.cash, second.bank], [true, -600, 0, 100]);
  assert.deepEqual(await get(ids.alice, alice), { upgrades: [{ upgrade_id: "stamina", level: 2 }], cash: 0, bank: 100, ceiling: 100 });
});

test("buy with no stored run still charges the ceiling and writes the level", async () => {
  const { alice, buy, get, earn, cash } = await setup();
  await earn(alice, 450);
  assert.equal((await buy(ids.alice, alice, "reserve-magazine", 1, "upg-aaaa-0003")).ok, true);
  assert.equal((await cash(alice)).spent, 400);
  assert.deepEqual((await get(ids.alice, alice)).upgrades, [{ upgrade_id: "reserve-magazine", level: 1 }]);
});

test("a retried request id replays the first answer and charges once; the same id with other arguments is a conflict", async () => {
  const { alice, buy, get, earn, cash } = await setup();
  await earn(alice, 2000);
  const first = await buy(ids.alice, alice, "dodge-recovery", 1, "upg-aaaa-0004");
  const again = await buy(ids.alice, alice, "dodge-recovery", 1, "upg-aaaa-0004");
  assert.deepEqual(again, { ...first, replayed: true });
  assert.equal((await cash(alice)).spent, 300);
  assert.deepEqual(await buy(ids.alice, alice, "dodge-recovery", 2, "upg-aaaa-0004"), { ok: false, error: "request-conflict" });
  assert.deepEqual(await buy(ids.alice, alice, "stamina", 1, "upg-aaaa-0004"), { ok: false, error: "request-conflict" });
  assert.equal((await cash(alice)).spent, 300);
  assert.deepEqual((await get(ids.alice, alice)).upgrades, [{ upgrade_id: "dodge-recovery", level: 1 }]);
});

test("refusals: not enough cash, a new request for a level already owned, skipping a level, past the top, an unknown upgrade, bad arguments; nothing changes", async () => {
  const { alice, buy, get, earn, cash } = await setup();
  await earn(alice, 350);
  assert.deepEqual(await buy(ids.alice, alice, "reserve-magazine", 1, "upg-bbbb-0001"), { ok: false, error: "insufficient-cash", ceiling: 350 });
  assert.equal((await buy(ids.alice, alice, "stamina", 1, "upg-bbbb-0002")).ok, true);
  assert.deepEqual(await buy(ids.alice, alice, "stamina", 1, "upg-bbbb-0003"), { ok: false, error: "already-owned", level: 1 });
  assert.deepEqual(await buy(ids.alice, alice, "stamina", 3, "upg-bbbb-0004"), { ok: false, error: "level-order", level: 1 });
  assert.deepEqual(await buy(ids.alice, alice, "reserve-magazine", 4, "upg-bbbb-0005"), { ok: false, error: "max-level", level: 0 });
  assert.deepEqual(await buy(ids.alice, alice, "nonesuch", 1, "upg-bbbb-0006"), { ok: false, error: "unknown-upgrade" });
  for (const [upgrade, level, id] of [["stamina", 0, "upg-bbbb-0007"], ["stamina", -1, "upg-bbbb-0008"], ["stamina", 21, "upg-bbbb-0009"], ["stamina", null, "upg-bbbb-0010"], ["stamina", 2, "short"], ["stamina", 2, null], [null, 2, "upg-bbbb-0011"]])
    assert.equal((await buy(ids.alice, alice, upgrade, level, id)).error, "bad-request", `${upgrade} ${level} ${id}`);
  assert.equal((await cash(alice)).spent, 300);
  assert.deepEqual((await get(ids.alice, alice)).upgrades, [{ upgrade_id: "stamina", level: 1 }]);
  // a refusal is not stored: the same id can be used again once the purse is full
  await earn(alice, 1000);
  assert.equal((await buy(ids.alice, alice, "reserve-magazine", 1, "upg-bbbb-0001")).ok, true);
});

test("the top level is bought level by level and the price list is read from the defs", async () => {
  const { db, alice, buy, get, earn, cash } = await setup();
  await earn(alice, 100000);
  const prices = (await call(db, "select price from public.arma_upgrade_defs where id = 'reserve-magazine'"))[0].price;
  for (let level = 1; level <= 3; level++) assert.equal((await buy(ids.alice, alice, "reserve-magazine", level, `upg-cccc-000${level}`)).delta, -prices[level - 1]);
  assert.equal((await buy(ids.alice, alice, "reserve-magazine", 4, "upg-cccc-0004")).error, "max-level");
  assert.equal((await cash(alice)).spent, prices.reduce((a, b) => a + b, 0));
  assert.deepEqual((await get(ids.alice, alice)).upgrades, [{ upgrade_id: "reserve-magazine", level: 3 }]);
  await db.exec("update public.arma_upgrade_defs set price = array[1, 2, 3] where id = 'reserve-magazine'");
  assert.equal((await buy(ids.alice, alice, "stamina", 1, "upg-cccc-0005")).ok, true, "other upgrades are unaffected");
});

test("guests do not trade, and nothing is sold when cash is not enforced", async () => {
  const { db, alice, buy, get, earn } = await setup();
  await earn(alice, 1000);
  await db.exec(`update auth.users set is_anonymous = true where id = '${ids.alice}'`);
  assert.deepEqual(await buy(ids.alice, alice, "stamina", 1, "upg-dddd-0001"), { ok: false, error: "guest" });
  assert.deepEqual((await get(ids.alice, alice)).upgrades, [], "a guest can still read its levels");
  await db.exec(`update auth.users set is_anonymous = false where id = '${ids.alice}'; update public.arma_config set value = 'false'::jsonb where key = 'enforce_cash'`);
  assert.deepEqual(await buy(ids.alice, alice, "stamina", 1, "upg-dddd-0002"), { ok: false, error: "cash-not-enforced" });
  assert.deepEqual((await get(ids.alice, alice)).upgrades, []);
});

test("another account's character, a closed world and a stranger are refused with O0007; levels are per character", async () => {
  const { db, alice, bob, buy, get, earn } = await setup();
  await earn(alice, 1000);
  await earn(bob, 1000);
  assert.equal((await failure(buy(ids.bob, alice, "stamina", 1, "upg-eeee-0001")))?.code, "O0007");
  assert.equal((await failure(get(ids.bob, alice)))?.code, "O0007");
  assert.equal((await failure(buy(ids.carol, bob, "stamina", 1, "upg-eeee-0002")))?.code, "O0007");
  assert.equal((await buy(ids.alice, alice, "stamina", 1, "upg-eeee-0003")).ok, true);
  assert.deepEqual((await get(ids.bob, bob)).upgrades, [], "bob's character is unchanged");
  await db.exec("update public.arma_config set value = 'false'::jsonb where key = 'arma_enabled'");
  assert.equal((await failure(buy(ids.alice, alice, "stamina", 2, "upg-eeee-0004")))?.code, "O0007");
});

test("the lock-down: clients read their own levels and the defs, write nothing and call no function; the writer calls only the two ops", async () => {
  const { db, alice, bob, buy, earn } = await setup();
  await earn(alice, 1000);
  await earn(bob, 1000);
  await buy(ids.alice, alice, "stamina", 1, "upg-ffff-0001");
  await buy(ids.bob, bob, "reserve-magazine", 1, "upg-ffff-0002");
  const own = await as(db, "authenticated", ids.alice, () => call(db, "select character, upgrade_id, level from public.arma_upgrades"));
  assert.deepEqual(own, [{ character: alice, upgrade_id: "stamina", level: 1 }], "RLS shows an account only its own characters' levels");
  assert.equal((await as(db, "authenticated", ids.alice, () => call(db, "select id from public.arma_upgrade_defs"))).length, 3);
  for (const sql of [
    `insert into public.arma_upgrades (character, upgrade_id, level) values ('${alice}', 'dodge-recovery', 5)`,
    `update public.arma_upgrades set level = 5`,
    `delete from public.arma_upgrades`,
    `update public.arma_upgrade_defs set price = array[1, 1, 1]`,
  ])
    await assert.rejects(as(db, "authenticated", ids.alice, () => call(db, sql)), /permission denied/, sql);
  await assert.rejects(as(db, "anon", null, () => call(db, "select * from public.arma_upgrades")), /permission denied/);
  for (const [fn, params] of [
    ["arma_upgrades_get($1, $2)", [ids.alice, alice]],
    ["arma_upgrade_buy($1, $2, 'stamina', 2, 'upg-ffff-0003')", [ids.alice, alice]],
    ["arma_upgrades_json($1)", [alice]],
  ])
    await assert.rejects(as(db, "authenticated", ids.alice, () => call(db, `select public.${fn}`, params)), /permission denied/, fn);
  const writer = await call(db, "select p.proname from pg_proc p where p.proname like 'arma\\_upgrade%' and has_function_privilege('arma_writer', p.oid, 'execute') order by 1");
  assert.deepEqual(writer.map((r) => r.proname), ["arma_upgrade_buy", "arma_upgrades_get"]);
  assert.equal((await call(db, "select has_function_privilege('arma_presence', 'public.arma_upgrade_buy(uuid, text, text, int, text)', 'execute') as ok"))[0].ok, false);
});

test("the down file hands the cash back into the stored record, lowers spent, bumps the revision and drops everything", async () => {
  const { db, alice, bob, buy, earn, save, run, cash } = await setup();
  await earn(alice, 3000);
  await earn(bob, 3000);
  await save(ids.alice, alice, 0, 1, 2500);
  await buy(ids.alice, alice, "stamina", 1, "upg-gggg-0001");
  await buy(ids.alice, alice, "stamina", 2, "upg-gggg-0002");
  await buy(ids.alice, alice, "reserve-magazine", 1, "upg-gggg-0003");
  await buy(ids.bob, bob, "dodge-recovery", 1, "upg-gggg-0004"); // bob never saved a run
  assert.equal((await cash(alice)).spent, 300 + 600 + 400);
  assert.equal((await run(alice)).carried, String(2500 - 1300));
  await db.exec(down);
  assert.deepEqual([(await cash(alice)).spent, (await run(alice)).carried, (await run(alice)).revision], [0, "2500", 2]);
  assert.equal((await cash(bob)).spent, 0);
  assert.equal((await call(db, "select count(*)::int as n from public.arma_market_requests where op = 'upgrade'"))[0].n, 0);
  assert.equal((await call(db, "select count(*)::int as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname like 'arma\\_upgrade%'"))[0].n, 0);
  assert.equal((await call(db, "select count(*)::int as n from pg_tables where schemaname = 'public' and tablename like 'arma\\_upgrade%'"))[0].n, 0);
});
