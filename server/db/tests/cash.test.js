// A2 PR 2: money comes from kills the database settled, and a save can never claim more than that (migration 000008). Real migrations on pglite.
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
  // Save a v18 record holding this money; the revision advances only when the save was applied.
  const save = async (carried, bank = 0, record = v18) => {
    const r = (await call(db, "select public.arma_save_run($1, $2, 18, $3::jsonb, $4, $5) as r", [ids.alice, alice, JSON.stringify({ ...record, marked: { ...record.marked, carried, bank } }), revision, ++seq]))[0].r;
    if (r.revision) revision = r.revision;
    return r;
  };
  return { db, alice, kill, earned, save };
}

test("cash after N kills is the sum of the payout table, and a save may claim exactly that and not a coin more", async () => {
  const { db, kill, earned, save } = await setup();
  const rows = Object.fromEntries((await call(db, "select kind, cash from public.arma_payout_rules")).map((r) => [r.kind, r.cash]));
  assert.equal(rows["original-rat"], 100, "creatures pay cashPerKill");
  assert.equal(rows["boss-warden"], 200, "bosses pay bossCash");
  assert.equal(await earned(), 0);
  for (const [instance, kind] of [["rat-1", "original-rat"], ["rat-2", "original-rat"], ["wolf-1", "original-wolf"], ["warden-1", "boss-warden"]]) assert.equal((await kill(instance, kind)).killed, true);
  assert.equal(await earned(), rows["original-rat"] * 2 + rows["original-wolf"] + rows["boss-warden"], "two rats, a wolf and a boss");
  const total = await earned();
  assert.equal((await save(total + 1, 0)).reason, "cash:marked", "one coin over the server's sum");
  assert.equal((await save(0, total + 1)).reason, "cash:marked", "the bank counts too");
  assert.equal((await save(total - 100, 100)).revision, 1, "carried and bank may split the total any way");
  assert.equal((await save(0, total)).revision, 2, "banking everything");
  assert.equal((await save(0, 0)).revision, 3, "spending or dying only lowers it");
});

test("a forged cash delta is refused and stores nothing", async () => {
  const { db, alice, earned, save } = await setup();
  const refused = await save(1_000_000, 0);
  assert.deepEqual([refused.refused, refused.reason], ["cash", "cash:marked"]);
  assert.equal((await call(db, "select public.arma_load_run($1, $2) as r", [ids.alice, alice]))[0].r, null, "nothing was stored");
  assert.equal((await save(5, 0)).reason, "cash:marked", "a first save of money nothing earned (offline progress: fresh start online)");
  assert.equal(await earned(), 0);
  assert.equal((await save(0, 0)).revision, 1, "a record with no money is fine");
  assert.equal((await save(1, 0)).reason, "cash:marked", "and a later +1 is a forged delta too");
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
  // The legacy row is revision 1; each attempt uses a fresh seq.
  let seq = 0;
  const resave = async (revision, carried, bank) =>
    (await call(db, "select public.arma_save_run($1, $2, 18, $3::jsonb, $4, $5) as r", [ids.alice, alice, JSON.stringify({ ...v18, marked: { ...v18.marked, carried, bank } }), revision, ++seq]))[0].r;
  assert.equal((await resave(1, 100, 150)).revision, 2, "the same money re-saves");
  assert.equal((await resave(2, 101, 150)).reason, "cash:marked", "one coin more than it held is refused");
  assert.equal((await resave(2, 0, 150)).revision, 3, "lowering is always allowed");
  assert.equal((await resave(3, 100, 150)).reason, "cash:marked", "and the money it gave up is not claimable again without a kill");
});

test("enforce_cash = false is the ops escape hatch", async () => {
  const { db, save } = await setup();
  assert.equal((await save(999, 0)).reason, "cash:marked");
  await db.exec("update public.arma_config set value = 'false'::jsonb where key = 'enforce_cash'");
  assert.equal((await save(999, 0)).revision, 1);
});
