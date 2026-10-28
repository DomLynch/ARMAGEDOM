// A throwaway Postgres (pglite) with just enough of Supabase's own pieces (roles anon/authenticated, auth.users, auth.uid())
// for the real migration files to run unchanged. Nothing here connects to any hosted project.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations");

const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, is_anonymous boolean not null default false);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

export const ids = {
  alice: "00000000-0000-4000-8000-00000000000a",
  bob: "00000000-0000-4000-8000-00000000000b",
  carol: "00000000-0000-4000-8000-00000000000c", // signed up, never granted access (core tests); a regular player in the world tests
  dave: "00000000-0000-4000-8000-00000000000d",
};

export async function freshDb({ migrations = true } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  await db.exec(Object.values(ids).map((id) => `insert into auth.users (id) values ('${id}');`).join("\n"));
  if (migrations)
    for (const file of fs.readdirSync(root).filter((f) => f.endsWith(".sql")).sort()) await db.exec(fs.readFileSync(path.join(root, file), "utf8"));
  return db;
}

/** Run `fn` as a database role (optionally as a signed-in user); always resets afterwards. */
export async function as(db, role, user, fn) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${user ?? ""}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

/** The error code and message of a failing statement, or null if it succeeded. */
export async function failure(promise) {
  try {
    await promise;
    return null;
  } catch (error) {
    return { code: error.code, message: error.message };
  }
}

export async function openFor(db, ...accounts) {
  await db.exec(`update public.arma_config set value = 'true'::jsonb where key = 'arma_enabled';`);
  for (const id of accounts) await db.exec(`insert into public.arma_access (account) values ('${id}');`);
}

export const call = (db, sql, params = []) => db.query(sql, params).then((r) => r.rows);
