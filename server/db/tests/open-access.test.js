// Open access under a flag: arma_allowed is the one gate; with the flag off it is the access list as before, with it on any real account
// (a guest's anonymous session included) is let in, and the kill switch still closes everyone.
import test from "node:test";
import assert from "node:assert/strict";
import { as, call, freshDb, ids } from "./helpers.js";

const allowed = async (db, account) => (await call(db, "select public.arma_allowed($1) as r", [account]))[0].r;
const set = (db, key, value) => db.exec(`update public.arma_config set value = '${value}'::jsonb where key = '${key}'`);
const STRANGER = "00000000-0000-4000-8000-0000000000ee"; // a well-formed id that is in no auth.users row

async function world() {
  const db = await freshDb();
  await db.exec(`insert into public.arma_access (account) values ('${ids.alice}')`);
  return db;
}

test("the flag is off by default and the kill switch is off by default: nobody is let in", async () => {
  const db = await world();
  assert.equal((await call(db, "select value from public.arma_config where key = 'arma_open_access'"))[0].value, false);
  for (const account of [ids.alice, ids.carol]) assert.equal(await allowed(db, account), false);
});

test("closed alpha (flag off): only the access list gets in, as before", async () => {
  const db = await world();
  await set(db, "arma_enabled", "true");
  assert.deepEqual([await allowed(db, ids.alice), await allowed(db, ids.carol), await allowed(db, STRANGER)], [true, false, false]);
});

test("open access (flag on): every real account gets in, a guest included, an id that is in no auth.users row does not", async () => {
  const db = await world();
  await set(db, "arma_enabled", "true");
  await set(db, "arma_open_access", "true");
  assert.deepEqual([await allowed(db, ids.alice), await allowed(db, ids.carol), await allowed(db, ids.dave)], [true, true, true]);
  assert.equal(await allowed(db, STRANGER), false, "nothing can be created for an account that does not exist");
  assert.equal(await allowed(db, null), false);
});

test("the kill switch beats the flag: arma_enabled = false closes everyone, listed or not", async () => {
  const db = await world();
  await set(db, "arma_open_access", "true");
  for (const account of [ids.alice, ids.carol]) assert.equal(await allowed(db, account), false);
});

test("a guest on open access can create a character through the real function; closing the flag closes them again", async () => {
  const db = await world();
  await set(db, "arma_enabled", "true");
  await set(db, "arma_open_access", "true");
  await db.exec("set role arma_writer");
  const made = (await call(db, "select public.arma_create_character($1, 'Guest') as r", [ids.carol]))[0].r;
  assert.match(made.id ?? made, /^pc:/);
  await db.exec("reset role");
  await set(db, "arma_open_access", "false");
  assert.equal(await allowed(db, ids.carol), false);
  // Their character stays theirs, and a client still reads nothing without the gate.
  assert.equal((await as(db, "authenticated", ids.carol, () => call(db, "select public.arma_me_allowed() as r")))[0].r, false);
  await set(db, "arma_open_access", "true");
  assert.equal((await as(db, "authenticated", ids.carol, () => call(db, "select public.arma_me_allowed() as r")))[0].r, true);
});

test("the gate is still not callable by clients, and the flag cannot be written by them", async () => {
  const db = await world();
  const rows = await call(
    db,
    `select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as client, has_function_privilege('anon', p.oid, 'execute') as anon
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'arma_allowed'`,
  );
  assert.deepEqual(rows.map((r) => [r.client, r.anon]), [[false, false]]);
  assert.equal(await as(db, "authenticated", ids.carol, () => db.exec("update public.arma_config set value = 'true'::jsonb").then(() => "wrote", () => "refused")), "refused");
});
