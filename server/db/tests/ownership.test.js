// A2 PR 3b: report-only ownership (migration 000010). A save claiming an always-drop weapon the server has no receipt for is stored EXACTLY as sent,
// the reply lists the paths, and a server-side counter is bumped. Real migrations on pglite.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { as, call, freshDb, ids, openFor } from "./helpers.js";

const v18 = JSON.parse(fs.readFileSync(new URL("../../../Web/tests/fixtures/navigation203-source202-v18.json", import.meta.url), "utf8"));
const ALL = ["bossEquipment.commanderPistol", "bossEquipment.emberProjector", "bossEquipment.grenade", "bossEquipment.rocketLauncher", "bossEquipment.shotgun", "bossEquipment.surgicalKnife", "rifle", "uniqueReward"];

async function setup() {
  const db = await freshDb();
  await openFor(db, ids.alice);
  const [{ id: alice }] = await call(db, "select public.arma_create_character($1, 'Alice') as id", [ids.alice]);
  await db.exec(`delete from public.arma_weapon_rules; insert into public.arma_weapon_rules values ('knife', 10, 4);`); // the seeded item sources and loot rules stay
  await db.exec("update public.arma_config set value = 'false'::jsonb where key = 'enforce_cash'"); // the v18 fixture holds 250 cash; cash has its own tests
  let seq = 0,
    revision = 0;
  const kill = async (instance, kind, area) => {
    const token = `token-${instance.replace(/[^a-z0-9]/g, "")}-aaaaaaaa`;
    await call(db, "select public.arma_spawn_engage($1, $2, $3, $4, $5, $6, 10)", [ids.alice, alice, token, instance, kind, area]);
    await db.exec(`update public.arma_spawn_engages set last_hit_at = now() - interval '1 second' where token = '${token}'`);
    return (await call(db, "select public.arma_spawn_hit($1, $2, 'knife', 10, 1, 60) as r", [ids.alice, token]))[0].r;
  };
  // Save a record; the revision advances only when applied. `seqNo` and `rev` let a test resend the identical save.
  const save = async (record, { seqNo, rev } = {}) => {
    const r = (await call(db, "select public.arma_save_run($1, $2, 18, $3::jsonb, $4, $5) as r", [ids.alice, alice, JSON.stringify(record), rev ?? revision, seqNo ?? ++seq]))[0].r;
    if (r.revision && !r.replayed && rev === undefined) revision = r.revision;
    return r;
  };
  const stored = async () => (await call(db, "select record from public.arma_runs where character = $1", [alice]))[0].record;
  const counters = async () => Object.fromEntries((await call(db, "select item, saves from public.arma_unreceipted_seen where character = $1", [alice])).map((r) => [r.item, r.saves]));
  const withStatus = (path, status) => {
    const copy = structuredClone(v18);
    const target = path.split(".").reduce((o, k) => o[k], copy);
    target.status = status;
    return copy;
  };
  return { db, alice, kill, save, stored, counters, withStatus };
}

test("the item sources are the eight always-drop weapons and say where the record keeps each", async () => {
  const { db } = await setup();
  const rows = await call(db, "select path, item from public.arma_item_sources order by path");
  assert.deepEqual(rows.map((r) => r.path), ALL);
  assert.equal(rows.find((r) => r.path === "rifle").item, "bridge-warden-rifle-v1");
  const loot = new Set((await call(db, "select item from public.arma_loot_rules")).map((r) => r.item));
  assert.deepEqual(rows.map((r) => r.item).sort(), [...loot].sort(), "every item a receipt can be minted for is a source, and the reverse (3a's rules)");
});

test("an unreceipted 'owned' weapon is reported, and the stored record is byte-for-byte what was sent", async () => {
  const { save, stored, counters } = await setup();
  const answer = await save(v18); // the fixture says every one of the eight is owned
  assert.equal(answer.revision, 1);
  assert.deepEqual(answer.unreceipted, ALL);
  assert.deepEqual(await stored(), v18, "no field of the save changed or was dropped");
  assert.equal(Object.keys(await counters()).length, 8);
});

test("a receipt removes the path from the report, and only that one", async () => {
  const { kill, save, stored, counters } = await setup();
  assert.equal((await kill("east-bridge:boss-warden-v1", "boss-warden", "east-bridge")).minted, 1); // the rifle's receipt
  const answer = await save(v18);
  assert.deepEqual(answer.unreceipted, ALL.filter((p) => p !== "rifle"));
  assert.deepEqual(await stored(), v18);
  assert.equal((await counters())["bridge-warden-rifle-v1"], undefined, "a receipted item has no counter row");
  assert.equal((await counters())["hale-pitborn-cleaver-v1"], 1);
});

test("every save that still claims it bumps the counter once; a retried save does not", async () => {
  const { save, counters } = await setup();
  const first = await save(v18, { seqNo: 10 });
  assert.equal(first.revision, 1);
  const retry = await save(v18, { seqNo: 10, rev: 0 });
  assert.deepEqual(retry, { ...first, replayed: true }, "the replay answers the same report");
  assert.equal((await counters())["surgeons-knife-v1"], 1, "the replay counted nothing");
  assert.equal((await save({ ...v18, hp: 90 }, { seqNo: 11 })).revision, 2); // a new save with the same claims
  assert.equal((await counters())["surgeons-knife-v1"], 2);
});

test("only 'owned' is reported: eligible, pending, legacy-dead and missing layers are not claims", async () => {
  const { save, withStatus } = await setup();
  const base = withStatus("rifle", "eligible");
  for (const path of ALL.slice(0, -1)) path.split(".").reduce((o, k) => o[k], base).status = "pending";
  base.uniqueReward.status = "legacy-dead";
  const answer = await save(base);
  assert.equal(answer.unreceipted, undefined, "nothing owned, nothing reported");
  const sparse = { ...v18 };
  delete sparse.rifle;
  delete sparse.uniqueReward;
  delete sparse.bossEquipment;
  assert.equal((await save(sparse)).unreceipted, undefined, "records without the layers (older eras) are fine");
});

test("the report reaches no client and no role can call the check", async () => {
  const { db, alice } = await setup();
  for (const table of ["arma_item_sources", "arma_unreceipted_seen"])
    for (const role of ["authenticated", "anon"])
      await assert.rejects(as(db, role, ids.alice, () => call(db, `select * from public.${table}`)), /permission denied/, `${role} ${table}`);
  await assert.rejects(as(db, "authenticated", ids.alice, () => call(db, "select public.arma_unreceipted($1, '{}'::jsonb)", [alice])), /permission denied/);
});
