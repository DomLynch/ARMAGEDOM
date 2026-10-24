// A2 PR 2: money comes from kills the database settled, and a save is clamped to it (migration 000008). Real migrations on pglite.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { call, freshDb, ids, openFor } from "./helpers.js";

const v18 = JSON.parse(fs.readFileSync(new URL("../../../Web/tests/fixtures/navigation203-source202-v18.json", import.meta.url), "utf8"));

async function setup() {
  const db = await freshDb();
  await openFor(db, ids.alice);
  const [{ id: alice }] = await call(db, "select public.arma_create_character($1, 'Alice') as id", [ids.alice]);
  await db.exec(`delete from public.arma_weapon_rules; insert into public.arma_weapon_rules values ('knife', 10, 4);`); // 10 damage a hit
  let seq = 0,
    revision = 0;
  // Settle one kill of `kind`: a 10 hp creature, one knife hit.
  const kill = async (instance, kind) => {
    const token = `token-${instance}-aaaaaaaaaaaa`;
    await call(db, "select public.arma_spawn_engage($1, $2, $3, $4, $5, 'westminster', 10)", [ids.alice, alice, token, instance, kind]);
    await db.exec(`update public.arma_spawn_engages set last_hit_at = now() - interval '1 second' where token = '${token}'`);
    return (await call(db, "select public.arma_spawn_hit($1, $2, 'knife', 10, 1, 60) as r", [ids.alice, token]))[0].r;
  };
  const earned = async () => (await call(db, "select coalesce((select earned from public.arma_cash where character = $1), 0)::int as n", [alice]))[0].n;
  const record = (carried, bank, extra = {}) => ({ ...v18, ...extra, marked: { ...v18.marked, carried, bank } });
  // Save a v18 record holding this money (a fresh seq each time unless one is given); the revision advances only when the save was applied.
  const save = async (carried, bank = 0, { extra, seqNo } = {}) => {
    const r = (await call(db, "select public.arma_save_run($1, $2, 18, $3::jsonb, $4, $5) as r", [ids.alice, alice, JSON.stringify(record(carried, bank, extra)), revision, seqNo ?? ++seq]))[0].r;
    if (r.revision && !r.replayed) revision = r.revision;
    return r;
  };
  const stored = async () => (await call(db, "select public.arma_load_run($1, $2) as r", [ids.alice, alice]))[0].r?.record;
  return { db, alice, kill, earned, save, stored };
}

test("cash after N kills is the sum of the payout table; a save is clamped to it, carried first, and a legit save is untouched", async () => {
  const { db, kill, earned, save, stored } = await setup();
  const rows = Object.fromEntries((await call(db, "select kind, cash from public.arma_payout_rules")).map((r) => [r.kind, r.cash]));
  assert.equal(rows["original-rat"], 100, "creatures pay cashPerKill");
  assert.equal(rows["boss-warden"], 200, "bosses pay bossCash");
  assert.equal(await earned(), 0);
  for (const [instance, kind] of [["rat-1", "original-rat"], ["rat-2", "original-rat"], ["wolf-1", "original-wolf"], ["warden-1", "boss-warden"]]) assert.equal((await kill(instance, kind)).killed, true);
  assert.equal(await earned(), rows["original-rat"] * 2 + rows["original-wolf"] + rows["boss-warden"], "two rats, a wolf and a boss");
  const total = await earned(); // 500
  // Legit: carried + bank within the sum, any split. Stored exactly as sent, no clamp fields.
  const legit = await save(total - 100, 100, { extra: { hp: 77 } });
  assert.equal(legit.clamped, undefined);
  assert.deepEqual([(await stored()).marked.carried, (await stored()).marked.bank, (await stored()).hp], [total - 100, 100, 77]);
  // Over by 1: carried gives it up first; everything else in the save is kept (hp 66 here).
  const over = await save(total + 1, 0, { extra: { hp: 66 } });
  assert.deepEqual([over.clamped, over.carried, over.bank], [true, total, 0]);
  assert.deepEqual([(await stored()).marked.carried, (await stored()).hp], [total, 66], "stored clamped, the rest as sent");
  // 300 carried + 400 bank = 700: 200 over, taken from carried (100 left), bank intact.
  const split = await save(300, 400);
  assert.deepEqual([split.clamped, split.carried, split.bank], [true, 100, 400]);
  // 50 carried + 800 bank = 850: 350 over, carried to 0, then 300 from the bank.
  const both = await save(50, 800);
  assert.deepEqual([both.carried, both.bank], [0, total]);
  assert.deepEqual([(await stored()).marked.carried, (await stored()).marked.bank], [0, total]);
  assert.equal((await save(0, 0)).clamped, undefined, "spending or dying only lowers it");
  assert.equal((await call(db, "select count(*)::int as n from public.arma_runs"))[0].n, 1);
});

test("a forged cash delta is clamped to what was earned and the rest of the save is kept", async () => {
  const { stored, save, earned } = await setup();
  const forged = await save(1_000_000, 0, { extra: { hp: 55 } });
  assert.deepEqual([forged.clamped, forged.carried, forged.bank, forged.revision], [true, 0, 0, 1], "nothing earned, nothing kept");
  const run = await stored();
  assert.deepEqual([run.marked.carried, run.marked.bank, run.hp], [0, 0, 55], "the progress in the same save survives");
  assert.equal(await earned(), 0, "the forgery granted nothing");
  assert.deepEqual([(await save(5, 0)).clamped, (await save(0, 5)).clamped], [true, true], "carried or bank, a later +5 is clamped too");
});

test("a retry replays the clamped answer and writes nothing", async () => {
  const { db, alice, stored } = await setup();
  // The answer was lost, so the phone sends the identical save again: same seq, same (old) revision, same record.
  const send = async () =>
    (await call(db, "select public.arma_save_run($1, $2, 18, $3::jsonb, 0, 7) as r", [ids.alice, alice, JSON.stringify({ ...v18, marked: { ...v18.marked, carried: 900, bank: 0 } })]))[0].r;
  const first = await send();
  assert.deepEqual([first.clamped, first.carried, first.bank, first.revision], [true, 0, 0, 1]);
  const retry = await send();
  assert.deepEqual(retry, { ...first, replayed: true }, "the same clamped numbers, flagged as a replay");
  assert.equal((await call(db, "select revision from public.arma_runs where character = $1", [alice]))[0].revision, 1, "the retry wrote nothing");
  assert.equal((await stored()).marked.carried, 0);
});

test("a retried kill grants once, a creature with no payout row grants nothing, and only kill events pay", async () => {
  const { db, alice, kill, earned } = await setup();
  assert.equal((await kill("rat-1", "original-rat")).killed, true);
  assert.equal(await earned(), 100);
  const id = `kill:rat-1:0:${ids.alice}`;
  const again = (event, kind, payload) => call(db, "select public.arma_record_event($1, $2, $3, $4, $5::jsonb)", [ids.alice, alice, event, kind, JSON.stringify(payload)]);
  await assert.rejects(again(id, "kill", { kind: "original-rat" }), (e) => e.code === "O0001", "the same kill event id is already settled");
  assert.equal(await earned(), 100, "the retry granted nothing");
  assert.equal((await kill("mystery-1", "mystery-kind")).killed, true);
  assert.equal(await earned(), 100, "no payout row, no cash");
  await again("save:x1", "save", { kind: "original-rat" });
  await again("travel:x2", "travel", { kind: "boss-warden" });
  await again("loot:x3", "loot", { kind: "boss-warden" });
  await again("hand-made-kill", "kill", { kind: "boss-warden" });
  assert.equal(await earned(), 100, "only a settled 'kill:' event pays");
});

test("old saves still load and re-save, but their total can never be raised", async () => {
  const { db, alice } = await setup();
  // A record stored before this migration: 250 in the fixture (100 carried + 150 bank), nothing earned.
  await db.exec(`insert into public.arma_runs (character, era, record) values ('${alice}', 18, '${JSON.stringify(v18).replaceAll("'", "''")}'::jsonb)`);
  const loaded = (await call(db, "select public.arma_load_run($1, $2) as r", [ids.alice, alice]))[0].r;
  assert.equal(loaded.record.marked.carried + loaded.record.marked.bank, 250);
  let seq = 0;
  const resave = async (revision, carried, bank) =>
    (await call(db, "select public.arma_save_run($1, $2, 18, $3::jsonb, $4, $5) as r", [ids.alice, alice, JSON.stringify({ ...v18, marked: { ...v18.marked, carried, bank } }), revision, ++seq]))[0].r;
  assert.equal((await resave(1, 100, 150)).clamped, undefined, "the same money re-saves untouched");
  const raised = await resave(2, 101, 150);
  assert.deepEqual([raised.clamped, raised.carried, raised.bank], [true, 100, 150], "one coin more than it held is taken back");
  assert.equal((await resave(3, 0, 150)).clamped, undefined, "lowering is always allowed");
  const regain = await resave(4, 100, 150);
  assert.deepEqual([regain.clamped, regain.carried], [true, 0], "and the money it gave up is not claimable again without a kill");
});

test("enforce_cash = false is the ops escape hatch", async () => {
  const { db, save } = await setup();
  assert.equal((await save(999, 0)).clamped, true);
  await db.exec("update public.arma_config set value = 'false'::jsonb where key = 'enforce_cash'");
  const r = await save(999, 0);
  assert.deepEqual([r.clamped, r.revision], [undefined, 2]);
});
