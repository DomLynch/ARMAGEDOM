import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { as, call, failure, freshDb, ids, openFor } from "./helpers.js";

const v18 = JSON.parse(fs.readFileSync(new URL("../../../Web/tests/fixtures/navigation203-source202-v18.json", import.meta.url), "utf8"));

async function setup() {
  const db = await freshDb();
  // These tests save the real v18 fixture (250 cash); cash enforcement has its own tests (cash.test.js).
  await db.exec("update public.arma_config set value = 'false'::jsonb where key = 'enforce_cash'");
  await openFor(db, ids.alice, ids.bob);
  const [{ id: alice }] = await call(db, "select public.arma_create_character($1, 'Alice') as id", [ids.alice]);
  const [{ id: bob }] = await call(db, "select public.arma_create_character($1, 'Bob') as id", [ids.bob]);
  return { db, alice, bob };
}

test("everything starts off: no function works until the flag is on and the account has access", async () => {
  const db = await freshDb();
  assert.equal((await call(db, "select public.arma_allowed($1) as ok", [ids.alice]))[0].ok, false);
  assert.equal((await failure(call(db, "select public.arma_create_character($1, 'Alice')", [ids.alice])))?.code, "O0007");
  await db.exec(`update public.arma_config set value = 'true'::jsonb where key = 'arma_enabled';`);
  assert.equal((await call(db, "select public.arma_allowed($1) as ok", [ids.alice]))[0].ok, false, "flag on is not enough without an access row");
  await db.exec(`insert into public.arma_access (account) values ('${ids.alice}');`);
  assert.equal((await call(db, "select public.arma_allowed($1) as ok", [ids.alice]))[0].ok, true);
  assert.equal((await call(db, "select public.arma_allowed($1) as ok", [ids.carol]))[0].ok, false);
});

test("a client role can read its own rows through RLS and can write nothing", async () => {
  const { db, alice, bob } = await setup();
  const seen = await as(db, "authenticated", ids.alice, () => call(db, "select id, name from public.arma_characters"));
  assert.deepEqual(seen, [{ id: alice, name: "Alice" }]);
  const bobSees = await as(db, "authenticated", ids.bob, () => call(db, "select id from public.arma_characters"));
  assert.deepEqual(bobSees.map((r) => r.id), [bob]);
  assert.deepEqual(await as(db, "authenticated", ids.carol, () => call(db, "select id from public.arma_characters")), [], "an account without access sees nothing");
  for (const sql of [
    `insert into public.arma_characters (id, account, name) values ('pc:x', '${ids.alice}', 'X')`,
    `update public.arma_characters set name = 'Hacked'`,
    `delete from public.arma_characters`,
    `insert into public.arma_runs (character, era, record) values ('${alice}', 18, '{"version":18}')`,
    `update public.arma_config set value = 'false'::jsonb`,
  ])
    assert.match((await as(db, "authenticated", ids.alice, () => failure(db.exec(sql))))?.message ?? "NO ERROR", /permission denied|row-level security/, sql);
  // Tables with no select grant are not readable at all, for either client role.
  for (const table of ["arma_config", "arma_access", "arma_active_character", "arma_character_location", "arma_weapon_rules", "arma_loot_rules", "arma_spawns", "arma_spawn_engages", "arma_spawn_damage"])
    for (const role of ["authenticated", "anon"])
      assert.match((await as(db, role, ids.alice, () => failure(call(db, `select * from public.${table}`))))?.message ?? "NO ERROR", /permission denied/, `${role} ${table}`);
  assert.match((await as(db, "anon", null, () => failure(call(db, "select * from public.arma_characters"))))?.message ?? "NO ERROR", /permission denied/);
});

test("client roles cannot call the writer functions, and the helpers answer only about the caller", async () => {
  const { db, alice } = await setup();
  for (const sql of [
    ["select public.arma_create_character($1, 'Z')", [ids.alice]],
    ["select public.arma_save_run($1, $2, 18, '{\"version\":18}', 0, 1)", [ids.alice, alice]],
    ["select public.arma_check_record('{\"version\":18}')", []],
    ["select public.arma_allowed($1)", [ids.alice]],
    ["select public.arma_owns($2, $1)", [ids.alice, alice]],
  ])
    assert.match((await as(db, "authenticated", ids.alice, () => failure(call(db, sql[0], sql[1]))))?.message ?? "NO ERROR", /permission denied/, sql[0]);
  const mine = await as(db, "authenticated", ids.alice, () => call(db, "select public.arma_me_allowed() as a, public.arma_me_owns($1) as o", [alice]));
  assert.deepEqual(mine, [{ a: true, o: true }]);
  const bobAsksAboutAlice = await as(db, "authenticated", ids.bob, () => call(db, "select public.arma_me_owns($1) as o", [alice]));
  assert.deepEqual(bobAsksAboutAlice, [{ o: false }]);
});

test("the server roles have no table grants, only the functions they are given", async () => {
  const { db, alice } = await setup();
  assert.match((await as(db, "arma_writer", null, () => failure(call(db, "select * from public.arma_runs"))))?.message ?? "NO ERROR", /permission denied/);
  assert.match((await as(db, "arma_writer", null, () => failure(db.exec("delete from public.arma_characters"))))?.message ?? "NO ERROR", /permission denied/);
  assert.equal((await as(db, "arma_writer", null, () => call(db, "select public.arma_save_run($1, $2, 18, $3::jsonb, 0, 1) as r", [ids.alice, alice, JSON.stringify(v18)])))[0].r.revision, 1);
  // Presence may move characters and nothing else.
  assert.equal((await as(db, "arma_presence", null, () => call(db, "select public.arma_save_location($1, 'westminster', 100, 200, $2) as r", [ids.alice, Date.now()])))[0].r.stored, true);
  assert.match((await as(db, "arma_presence", null, () => failure(call(db, "select public.arma_save_run($1, $2, 18, '{\"version\":18}', 0, 1)", [ids.alice, alice]))))?.message ?? "NO ERROR", /permission denied/);
  assert.match((await as(db, "arma_presence", null, () => failure(call(db, "select * from public.arma_character_location"))))?.message ?? "NO ERROR", /permission denied/);
});

test("every function is granted to the roles that call it (the missing-grant trap)", async () => {
  const db = await freshDb();
  const rows = await call(db, `
    select p.proname, has_function_privilege('arma_writer', p.oid, 'execute') as writer, has_function_privilege('arma_presence', p.oid, 'execute') as presence,
           has_function_privilege('authenticated', p.oid, 'execute') as client, has_function_privilege('anon', p.oid, 'execute') as anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'arma\\_%' order by 1`);
  const byName = Object.fromEntries(rows.map((r) => [r.proname, r]));
  assert(!rows.some((r) => r.anon), "anon can execute nothing");
  assert.deepEqual(rows.filter((r) => r.client).map((r) => r.proname).sort(), ["arma_me_allowed", "arma_me_owns"]);
  for (const name of ["arma_create_character", "arma_set_active", "arma_active", "arma_save_location", "arma_saved_location", "arma_save_run", "arma_load_run", "arma_record_event", "arma_spawn_state", "arma_spawn_engage", "arma_spawn_hit", "arma_spawn_hit_batch"])
    assert(byName[name]?.writer, name + " must be granted to arma_writer");
  for (const name of ["arma_save_location", "arma_saved_location", "arma_active"]) assert(byName[name].presence, name + " must be granted to arma_presence");
  // Nothing that is not a server function leaks to the server roles by default.
  assert(!byName.arma_allowed.writer && !byName.arma_owns.writer);
});

test("location: the latest observation wins, the future is clamped, and ids are strings", async () => {
  const { db, alice } = await setup();
  const save = (area, x, z, atMs) => call(db, "select public.arma_save_location($1, $2, $3, $4, $5) as r", [ids.alice, area, x, z, atMs]).then((r) => r[0].r);
  const t = Date.now() - 60_000;
  assert.deepEqual(await save("westminster", 10, 20, t), { character: alice, stored: true });
  assert.equal((await save("east", 1, 1, t - 1000)).stored, false, "an older observation changes nothing");
  assert.equal((await save("east-bridge", 5, 6, t + 1000)).stored, true);
  assert.equal((await save("east-bridge", 7, 8, Date.now() + 3_600_000)).stored, true);
  const saved = (await call(db, "select public.arma_saved_location($1) as r", [ids.alice]))[0].r;
  assert.deepEqual([saved.area, saved.x, saved.z], ["east-bridge", 7, 8]);
  assert(new Date(saved.updated_at) <= new Date(), "a time in the future is taken as now");
  assert((await failure(save("East Bridge", 0, 0, t + 5000)))?.message.includes("check constraint"), "area ids are the registry's lower-case strings");
  assert((await failure(save("east", 999999, 0, t + 6000)))?.message.includes("check constraint"));
  assert.deepEqual((await call(db, "select public.arma_save_location($1, 'east', 1, 1, $2) as r", [ids.carol, Date.now()]))[0].r, { character: null, stored: false });
});

test("the run: create, stale refusal, era and shape checks, ownership, and a real v18 record round-trips", async () => {
  const { db, alice, bob } = await setup();
  // Every call here uses a fresh, rising sequence number (the envelope tests cover seq itself).
  let seq = 0;
  const save = (account, character, era, record, expected) => call(db, "select public.arma_save_run($1, $2, $3, $4::jsonb, $5, $6) as r", [account, character, era, JSON.stringify(record), expected, ++seq]).then((r) => r[0].r);
  assert.equal((await save(ids.alice, alice, 18, v18, 5)).refused, "stale", "a new run must be created with expected revision 0");
  assert.equal((await save(ids.alice, alice, 18, v18, 0)).revision, 1);
  assert.deepEqual(await save(ids.alice, alice, 18, v18, 0), { refused: "stale", revision: 1 }, "a second phone with the old revision is refused");
  assert.equal((await save(ids.alice, alice, 18, { ...v18, hp: 1 }, 1)).revision, 2);
  assert.equal((await save(ids.alice, alice, 99, { ...v18, version: 99 }, 2)).refused, "era");
  assert.equal((await save(ids.alice, alice, 0, { ...v18, version: 0 }, 2)).refused, "era");
  assert.equal((await save(ids.alice, alice, 18, { ...v18, version: 17 }, 2)).refused, "shape", "the record's own version must equal its era");
  assert.equal((await save(ids.alice, alice, 18, [1, 2], 2)).refused, "shape");
  assert.equal((await failure(save(ids.alice, bob, 18, v18, 0)))?.code, "O0007", "another account's character");
  assert.equal((await failure(save(ids.carol, alice, 18, v18, 0)))?.code, "O0007", "no access");
  const loaded = (await call(db, "select public.arma_load_run($1, $2) as r", [ids.alice, alice]))[0].r;
  assert.deepEqual([loaded.era, loaded.revision, loaded.record.hp], [18, 2, 1]);
  assert.equal((await call(db, "select public.arma_load_run($1, $2) as r", [ids.bob, alice]))[0].r, null, "no reading another account's run");
  const viaRls = await as(db, "authenticated", ids.alice, () => call(db, "select character, revision from public.arma_runs"));
  assert.deepEqual(viaRls, [{ character: alice, revision: 2 }]);
  assert.deepEqual(await as(db, "authenticated", ids.bob, () => call(db, "select character from public.arma_runs")), []);
});

test("events are idempotent: the second insert of an id raises O0001", async () => {
  const { db, alice } = await setup();
  const record = () => call(db, "select public.arma_record_event($1, $2, 'save:e1', 'save', '{}')", [ids.alice, alice]);
  await record();
  assert.equal((await failure(record()))?.code, "O0001");
  assert.equal((await call(db, "select count(*)::int as n from public.arma_events"))[0].n, 1);
  const own = await as(db, "authenticated", ids.alice, () => call(db, "select event_id, kind from public.arma_events"));
  assert.deepEqual(own, [{ event_id: "save:e1", kind: "save" }]);
  assert.match((await as(db, "authenticated", ids.alice, () => failure(call(db, "select payload from public.arma_events"))))?.message ?? "NO ERROR", /permission denied/, "payload is not a client column");
});

test("each migration has an exact down file", async () => {
  const db = await freshDb();
  const down = fs.readdirSync(new URL("../../../supabase/down/", import.meta.url)).sort().reverse();
  for (const file of down) await db.exec(fs.readFileSync(new URL("../../../supabase/down/" + file, import.meta.url), "utf8"));
  const left = await call(db, "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'arma\\_%'");
  assert.equal(left[0].n, 0);
  assert.equal((await call(db, "select count(*)::int as n from pg_tables where schemaname = 'public'"))[0].n, 0);
  assert.equal((await call(db, "select count(*)::int as n from pg_roles where rolname like 'arma\\_%'"))[0].n, 0);
});
