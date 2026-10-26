// node --test ops/realtime/check-db-drift.test.mjs   (needs npm install in server/db for pglite)
// "Hosted" here is a second pglite with the migrations applied and the registry table apply-migrations.sh creates; each test changes it the
// way a drifting hosted database could and checks the drift check names the change, and that the explicit allow-list does not.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { freshDb } from "../../server/db/tests/helpers.js";
import { ALLOW, MIGRATIONS_DIR, diffSnapshots, driftReport, expectedSnapshot, snapshotSql } from "./check-db-drift.mjs";

const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
const sha = (file) => createHash("sha256").update(fs.readFileSync(path.join(MIGRATIONS_DIR, file))).digest("hex");

// A hosted-like database: the migrations, plus the registry table from ops/realtime/apply-migrations.sh with one row per file.
async function hosted(change = async () => {}) {
  const db = await freshDb();
  await db.exec(`create table public.arma_schema_migrations (name text primary key, sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'), applied_at timestamptz not null default now());
    alter table public.arma_schema_migrations enable row level security;
    revoke all on public.arma_schema_migrations from public, anon, authenticated;`);
  for (const file of files) await db.exec(`insert into public.arma_schema_migrations (name, sha256) values ('${file}', '${sha(file)}')`);
  await change(db);
  const rows = (await db.query(snapshotSql({ registry: true }))).rows.map(({ s, k, v }) => ({ s, k, v }));
  await db.close?.();
  return rows;
}
let repo;
const expected = async () => (repo ??= await expectedSnapshot());
const drift = async (change) => driftReport(await hosted(change), await expected());
const lines = (report) => report.differences.map((d) => `${d.section} ${d.key}`);

test("an untouched database reports zero drift, and the report says what it checked", async () => {
  const report = await drift();
  assert.deepEqual(report.differences, []);
  assert.match(report.text, /^zero drift \(13 migrations, \d+ seeded rows, 22 functions, 20 tables, 4 policies\)$/);
});

test("the allow-list is data: the live switches, and the service_role grants, may differ and nothing else may", async () => {
  assert.deepEqual(Object.keys(ALLOW.liveConfigKeys).sort(), ["arma_enabled", "arma_open_access"]);
  assert.deepEqual(Object.keys(ALLOW.allowedGrantees), ["service_role"]);
  const report = await drift(async (db) => {
    await db.exec(`update public.arma_config set value = 'true'::jsonb where key in ('arma_enabled', 'arma_open_access');
      create role service_role nologin;
      grant all on all tables in schema public to service_role; grant execute on all functions in schema public to service_role;`);
  });
  assert.deepEqual(report.differences, []);
});

test("a live switch holding something that is not a boolean, or any other config row changed, is reported", async () => {
  const text = await drift(async (db) => { await db.exec(`update public.arma_config set value = '"yes"'::jsonb where key = 'arma_enabled'`); });
  assert.match(lines(text).join("\n"), /row:arma_config.*arma_enabled/);
  const cash = await drift(async (db) => { await db.exec(`update public.arma_config set value = 'false'::jsonb where key = 'enforce_cash'`); });
  assert.equal(cash.differences.length, 2);
  assert.match(cash.text, /enforce_cash.*hosted.*repo|hosted.*enforce_cash/);
});

test("a changed seeded row is reported with the hosted value and the repo value", async () => {
  const report = await drift(async (db) => { await db.exec(`update public.arma_weapon_rules set max_damage_per_hit = 99 where weapon = 'railgun'`); });
  assert.equal(report.differences.length, 2);
  assert(report.differences.every((d) => d.section === "row:arma_weapon_rules"));
  assert.match(report.text, /row:arma_weapon_rules: only on hosted: .*railgun.*"max_damage_per_hit": 99/);
  assert.match(report.text, /row:arma_weapon_rules: only in repo: .*railgun.*"max_damage_per_hit": 45/);
  const removed = await drift(async (db) => { await db.exec(`delete from public.arma_payout_rules where ctid in (select ctid from public.arma_payout_rules limit 1)`); });
  assert.equal(removed.differences.length, 1);
  assert.equal(removed.differences[0].hosted, undefined);
  const added = await drift(async (db) => { await db.exec(`insert into public.arma_weapon_rules (weapon, max_damage_per_hit, max_hits_per_s) values ('laser', 1, 1)`); });
  assert.equal(added.differences.length, 1);
  assert.equal(added.differences[0].repo, undefined);
});

test("a changed, missing or extra function is reported", async () => {
  const body = await drift(async (db) => {
    const def = (await db.query(`select pg_get_functiondef('public.arma_allowed(uuid)'::regprocedure) d`)).rows[0].d;
    await db.exec(def.replace(/\n\$function\$\n$/, "\n-- drifted\n$function$\n"));
  });
  assert.deepEqual(lines(body), ["func arma_allowed(p_account uuid)"]);
  const invoker = await drift(async (db) => { await db.exec(`alter function public.arma_allowed(uuid) security invoker`); });
  assert.deepEqual(lines(invoker), ["func arma_allowed(p_account uuid)"]);
  const path_ = await drift(async (db) => { await db.exec(`alter function public.arma_allowed(uuid) set search_path = public`); });
  assert.deepEqual(lines(path_), ["func arma_allowed(p_account uuid)"]);
  const missing = await drift(async (db) => { await db.exec(`drop function public.arma_unreceipted(text, jsonb)`); });
  assert(lines(missing).includes("func arma_unreceipted(p_character text, p_record jsonb)"));
  assert(missing.differences.every((d) => d.hosted === undefined));
  const extra = await drift(async (db) => { await db.exec(`create function public.arma_backdoor() returns int language sql as $$ select 1 $$`); });
  assert(lines(extra).includes("func arma_backdoor()"));
});

test("a changed grant is reported: anon on a table, PUBLIC or anon on a function, and a role added", async () => {
  const table = await drift(async (db) => { await db.exec(`grant select on public.arma_weapon_rules to anon`); });
  assert.deepEqual(lines(table), ["grant:table arma_weapon_rules"]);
  assert.match(table.text, /anon:SELECT:false/);
  const fn = await drift(async (db) => { await db.exec(`grant execute on function public.arma_allowed(uuid) to anon`); });
  assert.deepEqual(lines(fn), ["grant:func arma_allowed(p_account uuid)"]);
  const pub = await drift(async (db) => { await db.exec(`grant execute on function public.arma_save_run(uuid, text, int, jsonb, int, int) to public`); });
  assert.match(pub.text, /PUBLIC:EXECUTE:false/);
  const revoked = await drift(async (db) => { await db.exec(`revoke select on public.arma_characters from authenticated`); });
  assert.deepEqual(lines(revoked), ["grant:table arma_characters"]);
  const other = await drift(async (db) => { await db.exec(`create role intruder nologin; grant select on public.arma_cash to intruder`); });
  assert.match(other.text, /intruder:SELECT:false/);
});

test("row-level security off or forced, and a changed or dropped policy, are reported", async () => {
  const off = await drift(async (db) => { await db.exec(`alter table public.arma_weapon_rules disable row level security`); });
  assert.deepEqual(lines(off), ["rls arma_weapon_rules"]);
  assert.match(off.text, /hosted "false\|false", repo "true\|false"/);
  const forced = await drift(async (db) => { await db.exec(`alter table public.arma_cash force row level security`); });
  assert.deepEqual(lines(forced), ["rls arma_cash"]);
  const dropped = await drift(async (db) => { await db.exec(`drop policy "an account reads its own run" on public.arma_runs`); });
  assert.deepEqual(lines(dropped), ["policy arma_runs.an account reads its own run"]);
  const widened = await drift(async (db) => {
    await db.exec(`drop policy "an account reads its own run" on public.arma_runs; create policy "an account reads its own run" on public.arma_runs for select to authenticated using (true)`);
  });
  assert.deepEqual(lines(widened), ["policy arma_runs.an account reads its own run"]);
});

test("the registry: a missing migration, a different sha, an extra row, and a registry table left open are reported", async () => {
  const last = files.at(-1);
  const missing = await drift(async (db) => { await db.exec(`delete from public.arma_schema_migrations where name = '${last}'`); });
  assert.deepEqual(lines(missing), [`registry ${last}`]);
  assert.equal(missing.differences[0].hosted, undefined);
  const wrong = await drift(async (db) => { await db.exec(`update public.arma_schema_migrations set sha256 = '${"0".repeat(64)}' where name = '${files[0]}'`); });
  assert.deepEqual(lines(wrong), [`registry ${files[0]}`]);
  assert.equal(wrong.differences[0].hosted, "0".repeat(64));
  assert.equal(wrong.differences[0].repo, sha(files[0]));
  const extra = await drift(async (db) => { await db.exec(`insert into public.arma_schema_migrations (name, sha256) values ('20261030000099_x.sql', '${"1".repeat(64)}')`); });
  assert.deepEqual(lines(extra), ["registry 20261030000099_x.sql"]);
  const open = await drift(async (db) => { await db.exec(`alter table public.arma_schema_migrations disable row level security; grant select on public.arma_schema_migrations to anon`); });
  assert.deepEqual(lines(open).sort(), ["registry-table grants", "registry-table rls"]);
});

test("diffSnapshots is symmetric about which side has the row, and an equal pair is silent", () => {
  const a = [{ s: "func", k: "f()", v: "1" }, { s: "rls", k: "t", v: "x" }];
  const b = [{ s: "func", k: "f()", v: "2" }, { s: "rls", k: "t", v: "x" }, { s: "policy", k: "t.p", v: "y" }];
  assert.deepEqual(diffSnapshots(a, b), [
    { section: "func", key: "f()", hosted: "1", repo: "2" },
    { section: "policy", key: "t.p", hosted: undefined, repo: "y" },
  ]);
  assert.deepEqual(diffSnapshots(a, a), []);
});

test("the command line: --print-sql prints the snapshot query, --actual exits 0 on zero drift and 1 on a difference", async () => {
  const script = path.resolve(path.dirname(new URL(import.meta.url).pathname), "check-db-drift.mjs");
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  assert.equal(run("--print-sql").stdout.trim(), snapshotSql({ registry: true }).trim());
  assert.match(snapshotSql({ registry: true }), /read only|select s, k, v/);
  assert(!/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i.test(snapshotSql({ registry: true }).replace(/'[^']*'/g, "''")), "the snapshot SQL only reads");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-"));
  const same = path.join(dir, "same.json"), changed = path.join(dir, "changed.json");
  fs.writeFileSync(same, JSON.stringify(await hosted()));
  fs.writeFileSync(changed, JSON.stringify(await hosted(async (db) => { await db.exec(`grant select on public.arma_cash to anon`); })));
  const ok = run("--actual", same);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /^zero drift/);
  const bad = run("--actual", changed);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /1 difference:\ngrant:table arma_cash: hosted .*anon:SELECT:false.*repo ""/);
  assert.equal(run().status, 2);
  assert.equal(run("--hosted").status, 2, "without DRIFT_DATABASE_URL it refuses rather than guessing");
  fs.rmSync(dir, { recursive: true });
});
