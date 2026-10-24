#!/bin/bash
# Proves ops/realtime/apply-migrations.sh against a THROWAWAY Postgres 16 (its own data directory and port; never the VPS's real databases).
#   bash ops/realtime/test-apply.sh          as root on the VPS (initdb runs as the OS user postgres)
# The scratch cluster gets the few Supabase pieces the migrations lean on (roles anon/authenticated, auth.users, auth.uid()), exactly as
# server/db/tests/helpers.js does for pglite. Prints "ALL n CHECKS PASS" or the first failure.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/../.." && pwd)"
BASE="${ARMA_TEST_DIR:-/mnt/HC_Volume_107195252/armagedom-backend/pgtest-armagedom}"
PORT="${ARMA_TEST_PORT:-55432}"
BIN=/usr/lib/postgresql/16/bin
case "$BASE" in */pgtest-armagedom) ;; *) echo "refusing to use $BASE: the scratch directory must end in /pgtest-armagedom"; exit 2 ;; esac
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 2; }
ss -ltn | grep -q ":$PORT " && { echo "port $PORT is in use"; exit 2; }

as_pg() { su -s /bin/sh postgres -c "$1"; }
cleanup() { as_pg "$BIN/pg_ctl -D $BASE/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$BASE"; }
trap cleanup EXIT
rm -rf "$BASE"
mkdir -p "$BASE/etc" "$BASE/tree"
chown postgres:postgres "$BASE"
chmod 755 "$BASE"

echo "== scratch cluster on 127.0.0.1:$PORT"
as_pg "$BIN/initdb -D $BASE/data -A trust -U postgres" >/dev/null
# arma_writer must prove its password (so the SCRAM verifier is really tested); everyone else is trusted on loopback.
{ echo "host all arma_writer 127.0.0.1/32 scram-sha-256"; cat "$BASE/data/pg_hba.conf"; } >"$BASE/data/pg_hba.new"
mv "$BASE/data/pg_hba.new" "$BASE/data/pg_hba.conf"; chown postgres:postgres "$BASE/data/pg_hba.conf"
as_pg "$BIN/pg_ctl -D $BASE/data -l $BASE/pg.log -w -o '-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=$BASE' start" >/dev/null
export PGHOST=127.0.0.1 PGPORT=$PORT
sql() { psql -X -q -At -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
sql <<'SQL'
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
SQL

# A private copy of the tree, so the tamper case can edit a migration.
mkdir -p "$BASE/tree/ops" "$BASE/tree/supabase"
cp -R "$SRC/ops/realtime" "$BASE/tree/ops/realtime"; cp -R "$SRC/supabase/migrations" "$BASE/tree/supabase/migrations"
SCRIPT="$BASE/tree/ops/realtime/apply-migrations.sh"
FILES=$(ls "$BASE/tree/supabase/migrations"/*.sql | wc -l)

WRITER_PASSWORD='p@ss:word/with+odd=chars-0123456789'
ENC_PASSWORD='p%40ss%3Aword%2Fwith%2Bodd%3Dchars-0123456789'
printf 'OWNER_DATABASE_URL=postgres://postgres:ownerpw@127.0.0.1:%s/postgres?sslmode=disable\n' "$PORT" >"$BASE/etc/owner.env"
printf 'ARMA_WRITER=1\nDATABASE_URL=postgres://arma_writer:%s@127.0.0.1:%s/postgres\nARMA_INTERNAL_KEY=x\n' "$ENC_PASSWORD" "$PORT" >"$BASE/etc/writer.env"
chmod 600 "$BASE/etc/"*.env; chown root:root "$BASE/etc/"*.env
export ARMA_ENV_DIR="$BASE/etc"

n=0
ok() { n=$((n + 1)); echo "  ok $n - $1"; }
bad() { echo "  FAIL - $1"; echo "$2" | tail -15; exit 1; }
run() { bash "$SCRIPT" "$@" 2>&1; }

echo "== dry run changes nothing"
out=$(run --dry-run) || bad "dry run exited non-zero" "$out"
echo "$out" | grep -q "would apply" || bad "dry run did not list migrations" "$out"
[ -z "$(sql -c "select to_regclass('public.arma_schema_migrations')")" ] || bad "dry run created the registry" "$out"
[ "$(sql -c "select count(*) from pg_roles where rolname = 'arma_writer'")" = 0 ] || bad "dry run created a role" "$out"
ok "dry run lists $FILES migrations and creates nothing"

echo "== first apply"
out=$(run) || bad "apply failed" "$out"
echo "$out" | grep -q "^PASS" || bad "no PASS line" "$out"
[ "$(sql -c "select count(*) from public.arma_schema_migrations")" = "$FILES" ] || bad "registry does not hold every migration" "$out"
ok "applied $FILES migrations, recorded each, PASS"
echo "$out" | grep -q -F -e "$WRITER_PASSWORD" -e "$ENC_PASSWORD" -e "ownerpw" && bad "a secret was printed" "$out"
ok "no password appears in the output"
[ "$(sql -c "select left(rolpassword, 14) from pg_authid where rolname = 'arma_writer'")" = "SCRAM-SHA-256\$" ] || bad "arma_writer has no SCRAM verifier" "$out"
ok "arma_writer holds a SCRAM-SHA-256 verifier, not a plaintext password"
PGPASSWORD="$WRITER_PASSWORD" psql -X -q -At -U arma_writer -d postgres -c "select public.arma_active('00000000-0000-4000-8000-00000000000a')" >/dev/null || bad "arma_writer cannot log in with the decoded password and call a function" ""
ok "arma_writer logs in with the password from writer.env and can call its functions"
! PGPASSWORD="not-the-password-at-all" psql -X -q -At -U arma_writer -d postgres -c "select 1" >/dev/null 2>&1 || bad "a wrong password was accepted" ""
ok "a wrong password is refused"
[ "$(sql -c "select value from public.arma_config where key = 'arma_enabled'")" = "false" ] && [ "$(sql -c "select value from public.arma_config where key = 'arma_open_access'")" = "false" ] || bad "a switch is on after apply" "$out"
ok "arma_enabled and arma_open_access are both false"
[ "$(sql -c "select relrowsecurity from pg_class where relname = 'arma_schema_migrations'")" = "t" ] || bad "the registry has no RLS" ""
ok "the migration registry is itself private (RLS on)"

echo "== re-run is a no-op"
out=$(run) || bad "re-run failed" "$out"
echo "$out" | grep -q "migrations: 0 applied, $FILES already applied" || bad "re-run applied something" "$out"
echo "$out" | grep -q "^PASS" || bad "re-run did not PASS" "$out"
ok "second run applies nothing and still PASSes"

echo "== an applied migration that has changed is refused"
first=$(ls "$BASE/tree/supabase/migrations"/*.sql | head -1)
printf '\n-- edited after it was applied\n' >>"$first"
out=$(run) && bad "a tampered migration was accepted" "$out"
echo "$out" | grep -q "different contents" || bad "tamper not named" "$out"
cp "$SRC/supabase/migrations/$(basename "$first")" "$first"
ok "editing an applied migration aborts the run, naming the file"

echo "== verification bites"
sql -c "update public.arma_config set value = 'true'::jsonb where key = 'arma_enabled'"
out=$(run --check) && bad "--check passed with arma_enabled on" "$out"
echo "$out" | grep -q "arma_enabled is not false" || bad "switch not named" "$out"
sql -c "update public.arma_config set value = 'false'::jsonb where key = 'arma_enabled'"
ok "arma_enabled on -> FAIL naming it"
sql -c "update public.arma_config set value = 'true'::jsonb where key = 'arma_open_access'"
out=$(run --check) && bad "--check passed with open access on" "$out"
sql -c "update public.arma_config set value = 'false'::jsonb where key = 'arma_open_access'"
ok "arma_open_access on -> FAIL"
sql -c "grant insert on public.arma_runs to authenticated"
out=$(run --check) && bad "--check passed with a client write grant" "$out"
echo "$out" | grep -q "authenticated can write arma_runs" || bad "grant not named" "$out"
sql -c "revoke insert on public.arma_runs from authenticated"
ok "a client write grant -> FAIL naming the table"
sql -c "grant execute on function public.arma_save_run(uuid, text, int, jsonb, int) to authenticated"
out=$(run --check) && bad "--check passed with a client-callable function" "$out"
sql -c "revoke execute on function public.arma_save_run(uuid, text, int, jsonb, int) from authenticated"
ok "a client-callable arma function -> FAIL"
sql -c "alter table public.arma_runs disable row level security"
out=$(run --check) && bad "--check passed with RLS off" "$out"
sql -c "alter table public.arma_runs enable row level security"
ok "RLS off -> FAIL"
out=$(run --check) || bad "--check does not PASS on the restored state" "$out"
ok "restored state PASSes again; --check is read-only"

echo "== the env files are checked"
chmod 644 "$BASE/etc/owner.env"
out=$(run --check) && bad "a world-readable owner.env was accepted" "$out"
echo "$out" | grep -q "want 600 root:root" || bad "mode not named" "$out"
chmod 600 "$BASE/etc/owner.env"
ok "owner.env that is not root:root 0600 is refused"
cp "$BASE/etc/writer.env" "$BASE/writer.env.good"
printf 'ARMA_WRITER=1\nDATABASE_URL=postgres://someone_else:%s@127.0.0.1:%s/postgres\n' "$ENC_PASSWORD" "$PORT" >"$BASE/etc/writer.env"
out=$(run) && bad "a writer URL for another role was accepted" "$out"
echo "$out" | grep -q "arma_writer" || bad "role rule not named" "$out"
printf 'ARMA_WRITER=1\nDATABASE_URL=postgres://arma_writer:short@127.0.0.1:%s/postgres\n' "$PORT" >"$BASE/etc/writer.env"
out=$(run) && bad "a short password was accepted" "$out"
cp "$BASE/writer.env.good" "$BASE/etc/writer.env"; chmod 600 "$BASE/etc/writer.env"
ok "a writer URL for another role, or a password under 16 characters, is refused"

echo "ALL $n CHECKS PASS"
