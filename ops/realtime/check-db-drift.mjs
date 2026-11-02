// The drift check: does the hosted ARMAGEDOM database still equal what supabase/migrations say? Read-only; it never writes to hosted.
//   node ops/realtime/check-db-drift.mjs --hosted            runs the snapshot SQL with psql against $DRIFT_DATABASE_URL, the read-only role
//                                                            arma_drift_reader (migration 000014; never the owner), compares, prints the verdict
//   node ops/realtime/check-db-drift.mjs --print-sql         prints the snapshot SQL, to run anywhere (psql, the Supabase SQL editor)
//   node ops/realtime/check-db-drift.mjs --actual <file>     compares a JSON array of {s,k,v} rows that SQL produced
// Exit 0 and "zero drift", or exit 1 and one line per difference (section, key, hosted value, repo value). Exit 2 is an error.
// The expected side is built here: every migration applied to a fresh pglite (server/db/tests/helpers.js, so `npm install` in server/db),
// and the sha256 of each migration file for the registry. What may differ on purpose lives in ops/realtime/drift-allow.json, not here.
// It compares: the registry (name and sha256), the rows of the seeded tables, every arma_* function (md5 of its definition, SECURITY
// DEFINER, search_path, whether its owner is the tables' owner), table and function grants (the owner and the allowed roles left out),
// row-level security flags and policies, triggers (definition and enabled state), table columns, constraints and indexes, and the arma
// roles' attributes and memberships.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, "../../supabase/migrations");
export const ALLOW = JSON.parse(fs.readFileSync(path.join(here, "drift-allow.json"), "utf8"));
const REGISTRY = "arma_schema_migrations";
const LIVE = "<live switch>";

const quote = (text) => `'${String(text).replaceAll("'", "''")}'`;
// The non-owner grants of an ACL as "role:privilege:grantable" joined by commas (PUBLIC is grantee 0), the allowed roles left out.
const grantees = (acl, owner) => {
  const who = "case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end";
  return (
    `coalesce((select string_agg(${who} || ':' || a.privilege_type || ':' || a.is_grantable::text, ',' order by ${who}, a.privilege_type) ` +
    `from aclexplode(${acl}) a where a.grantee <> ${owner} and (a.grantee = 0 or pg_get_userbyid(a.grantee) <> all (array[${Object.keys(ALLOW.allowedGrantees).map(quote).join(", ")}]::text[]))), '')`
  );
};

/** The read-only snapshot query: rows of (s section, k key, v value). With `registry` it also reads public.arma_schema_migrations. */
export function snapshotSql({ registry = false } = {}) {
  const tables = `from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'arma\\_%' and c.relname <> '${REGISTRY}'`;
  const parts = [
    `select 'func' s, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' k, md5(pg_get_functiondef(p.oid)) || '|' || p.prosecdef::text || '|' || coalesce(p.proconfig::text, '') || '|owner is the table owner:' || (p.proowner = (select relowner from pg_class where oid = 'public.arma_config'::regclass))::text v from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'arma\\_%'`,
    `select 'grant:func', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ${grantees("coalesce(p.proacl, acldefault('f', p.proowner))", "p.proowner")} from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'arma\\_%'`,
    `select 'grant:table', c.relname, ${grantees("coalesce(c.relacl, acldefault('r', c.relowner))", "c.relowner")} ${tables}`,
    `select 'rls', c.relname, c.relrowsecurity::text || '|' || c.relforcerowsecurity::text ${tables}`,
    `select 'policy', tablename || '.' || policyname, cmd || '|' || permissive || '|' || array_to_string(roles, ',') || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '') from pg_policies where schemaname = 'public' and tablename like 'arma\\_%' and tablename <> '${REGISTRY}'`,
    // Triggers: the money path (arma_events_grant_cash) is a trigger, so a dropped, disabled or re-conditioned one must show.
    `select 'trigger', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) || '|' || t.tgenabled::text from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname like 'arma\\_%' and c.relname <> '${REGISTRY}' and not t.tgisinternal`,
    // Table shape: columns (type, not null, default, generated, identity), constraints (CHECK, unique, key, foreign key) and indexes.
    `select 'column', c.relname || '.' || a.attname, format_type(a.atttypid, a.atttypmod) || '|' || a.attnotnull::text || '|' || coalesce(pg_get_expr(d.adbin, d.adrelid), '') || '|' || a.attgenerated::text || '|' || a.attidentity::text from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'arma\\_%' and c.relname <> '${REGISTRY}' and a.attnum > 0 and not a.attisdropped`,
    `select 'constraint', c.relname || '.' || k.conname, pg_get_constraintdef(k.oid) from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname like 'arma\\_%' and c.relname <> '${REGISTRY}'`,
    `select 'index', tablename || '.' || indexname, indexdef from pg_indexes where schemaname = 'public' and tablename like 'arma\\_%' and tablename <> '${REGISTRY}'`,
    // The arma roles: attributes (super, createrole, createdb, login, bypassrls, inherit, connection limit, role settings) and the roles
    // each belongs to (a grant of postgres or service_role would carry its privileges past every other check).
    `select 'role', rolname, rolsuper::text || '|' || rolcreaterole::text || '|' || rolcreatedb::text || '|' || rolcanlogin::text || '|' || rolbypassrls::text || '|' || rolinherit::text || '|' || rolconnlimit::text || '|' || coalesce(rolconfig::text, '') from pg_roles where rolname like 'arma\\_%'`,
    `select 'memberof', u.rolname, coalesce(string_agg(g.rolname, ',' order by g.rolname), '') from pg_roles u left join pg_auth_members m on m.member = u.oid left join pg_roles g on g.oid = m.roleid where u.rolname like 'arma\\_%' group by u.rolname`,
    ...ALLOW.seededTables.map((t) => `select 'row:${t}', to_jsonb(x)::text, '' from public.${t} x`),
  ];
  if (registry)
    parts.push(
      `select 'registry', name, sha256 from public.${REGISTRY}`,
      `select 'registry-table', 'rls', c.relrowsecurity::text || '|' || c.relforcerowsecurity::text from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = '${REGISTRY}'`,
      `select 'registry-table', 'grants', ${grantees("coalesce(c.relacl, acldefault('r', c.relowner))", "c.relowner")} from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = '${REGISTRY}'`,
      `select 'registry-table', 'policy ' || policyname, cmd || '|' || permissive || '|' || array_to_string(roles, ',') || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '') from pg_policies where schemaname = 'public' and tablename = '${REGISTRY}'`,
    );
  return `select s, k, v from (\n${parts.join("\nunion all\n")}\n) snapshot order by s, k, v`;
}

/** What the repo says: every migration on a fresh pglite, plus each file's sha256 (the way apply-migrations.sh records it). */
export async function expectedSnapshot({ registry = true } = {}) {
  let freshDb;
  try {
    ({ freshDb } = await import(pathToFileURL(path.resolve(here, "../../server/db/tests/helpers.js")).href));
  } catch (error) {
    throw new Error(`pglite is not installed (run npm install in server/db): ${error.message}`);
  }
  const db = await freshDb();
  const rows = (await db.query(snapshotSql({ registry: false }))).rows.map(({ s, k, v }) => ({ s, k, v }));
  if (registry) {
    for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort())
      rows.push({ s: "registry", k: file, v: createHash("sha256").update(fs.readFileSync(path.join(MIGRATIONS_DIR, file))).digest("hex") });
    // The registry is made by apply-migrations.sh, not a migration; migration 000014 gives the drift reader SELECT and a policy on it.
    rows.push(
      { s: "registry-table", k: "rls", v: "true|false" },
      { s: "registry-table", k: "grants", v: "arma_drift_reader:SELECT:false" },
      { s: "registry-table", k: "policy the drift reader reads the seeded rows", v: "SELECT|PERMISSIVE|arma_drift_reader|true|" },
    );
  }
  await db.close?.();
  return rows;
}

// The live switches may hold either boolean on hosted; every other row, and a non-boolean there, is compared as it is.
function normalize(rows) {
  return rows.map(({ s, k, v }) => {
    if (s !== "row:arma_config") return { s, k, v };
    const row = JSON.parse(k);
    return Object.hasOwn(ALLOW.liveConfigKeys, row.key) && typeof row.value === "boolean" ? { s, k: JSON.stringify({ key: row.key, value: LIVE }), v } : { s, k, v };
  });
}

/** The differences between the hosted rows and the repo rows: [{ section, key, hosted, repo }], with undefined for a side that has no row. */
export function diffSnapshots(hosted, repo) {
  const index = (rows) => new Map(normalize(rows).map(({ s, k, v }) => [`${s}\u0000${k}`, { s, k, v }]));
  const [a, b] = [index(hosted), index(repo)];
  const out = [];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const [h, r] = [a.get(id), b.get(id)];
    if (h?.v !== r?.v) out.push({ section: (h ?? r).s, key: (h ?? r).k, hosted: h?.v, repo: r?.v });
  }
  return out.sort((x, y) => (x.section + x.key).localeCompare(y.section + y.key));
}

const show = (value) => (value === undefined ? "(missing)" : JSON.stringify(value));
export function driftReport(hosted, repo) {
  const differences = diffSnapshots(hosted, repo);
  if (!differences.length) {
    const count = (s) => normalize(repo).filter((row) => row.s === s || row.s.startsWith(`${s}:`)).length;
    return { differences, text: `zero drift (${count("registry")} migrations, ${count("row")} seeded rows, ${count("func")} functions, ${count("rls")} tables, ${count("policy")} policies)` };
  }
  // A seeded row is its own key, so a changed row shows as the hosted row and the repo row, one line each.
  const lines = differences.map((d) =>
    d.section.startsWith("row:")
      ? `${d.section}: ${d.hosted === undefined ? "only in repo" : "only on hosted"}: ${d.key}`
      : `${d.section} ${d.key}: hosted ${show(d.hosted)}, repo ${show(d.repo)}`,
  );
  return { differences, text: `${differences.length} difference${differences.length === 1 ? "" : "s"}:\n${lines.join("\n")}` };
}

function hostedSnapshot() {
  const url = process.env.DRIFT_DATABASE_URL;
  if (!url) throw new Error("set DRIFT_DATABASE_URL to a connection string for the read-only role arma_drift_reader (migration 000014)");
  const sql = `select coalesce(json_agg(x), '[]'::json) from (${snapshotSql({ registry: true })}) x`;
  const run = spawnSync("psql", [url, "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PGOPTIONS: "-c default_transaction_read_only=on" },
  });
  if (run.status !== 0) throw new Error(`psql failed: ${String(run.stderr).replace(url, "<url>").trim()}`);
  return JSON.parse(run.stdout);
}

async function main(argv) {
  const flag = (name) => argv.indexOf(name);
  if (flag("--print-sql") >= 0) return console.log(snapshotSql({ registry: true }));
  let hosted;
  if (flag("--hosted") >= 0) hosted = hostedSnapshot();
  else if (flag("--actual") >= 0) hosted = JSON.parse(fs.readFileSync(argv[flag("--actual") + 1], "utf8"));
  else {
    console.error("usage: check-db-drift.mjs --hosted | --actual <file.json> | --print-sql");
    process.exit(2);
  }
  const { differences, text } = driftReport(hosted, await expectedSnapshot());
  console.log(text);
  process.exit(differences.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch((error) => {
    console.error(`drift check could not run: ${error.message}`);
    process.exit(2);
  });
