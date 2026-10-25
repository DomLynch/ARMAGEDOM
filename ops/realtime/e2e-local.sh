#!/bin/bash
# End-to-end world proof on a THROWAWAY Postgres 16: the real writer and presence from a real release bundle (build-release.mjs, `npm ci`),
# migrations 1..N applied by the real apply-migrations.sh, and two simulated clients with locally minted test tokens (ops/realtime/e2e-driver.mjs).
# Nothing leaves the machine: Supabase Auth is replaced by a 20-line local HTTP server, there are no real accounts, and no hosted project, Frankendom
# service or real database is touched. Ports are 55433 (Postgres), 18480 (fake auth), 18891 (writer), 18894 (presence).
#   as root on the VPS, from a synced checkout (Web/node_modules symlinked):   bash ops/realtime/e2e-local.sh | tee receipt.txt
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/../.." && pwd)"
BASE="${ARMA_E2E_DIR:-/mnt/HC_Volume_107195252/armagedom-backend/pge2e-armagedom}"
PORT=55433
BIN="${ARMA_E2E_PGBIN:-/usr/lib/postgresql/16/bin}"
case "$BASE" in */pge2e-armagedom) ;; *) echo "refusing to use $BASE: the scratch directory must end in /pge2e-armagedom"; exit 2 ;; esac
# On the VPS this runs as root (initdb must run as the OS user postgres). On a Mac (ARMA_E2E_PGBIN=/opt/homebrew/opt/postgresql@17/bin, ARMA_E2E_DIR=<dir>/pge2e-armagedom)
# it runs as the logged-in user, who owns the scratch cluster; the cluster's superuser is still named postgres.
MAC=0; [ "$(uname)" = Darwin ] && MAC=1
[ "$MAC" = 1 ] || [ "$(id -u)" = 0 ] || { echo "run as root"; exit 2; }
busy() { if [ "$MAC" = 1 ]; then lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; else ss -ltn | grep -q ":$1 "; fi; }
for p in $PORT 18480 18891 18894; do busy "$p" && { echo "port $p is in use"; exit 2; }; done

if [ "$MAC" = 1 ]; then as_pg() { sh -c "$1"; }; else as_pg() { su -s /bin/sh postgres -c "$1"; }; fi
cleanup() { as_pg "$BIN/pg_ctl -D $BASE/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$BASE"; }
trap cleanup EXIT
rm -rf "$BASE"
mkdir -p "$BASE/etc" "$BASE/rel"
[ "$MAC" = 1 ] || chown postgres:postgres "$BASE"
chmod 755 "$BASE"

echo "== scratch cluster on 127.0.0.1:$PORT"
as_pg "$BIN/initdb -D $BASE/data -A trust -U postgres" >/dev/null
SOCK="$BASE"
if [ "$MAC" = 1 ]; then SOCK="/tmp/arma-e2e-$$"; mkdir -p "$SOCK"; fi # a unix socket path must be under ~100 characters on macOS
as_pg "$BIN/pg_ctl -D $BASE/data -l $BASE/pg.log -w -o '-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=$SOCK' start" >/dev/null || { cat "$BASE/pg.log"; exit 1; }
[ "$SOCK" = "$BASE" ] || trap 'as_pg "$BIN/pg_ctl -D $BASE/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$BASE" "$SOCK"' EXIT
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

echo "== migrations (the real apply-migrations.sh)"
printf 'OWNER_DATABASE_URL=postgres://postgres:x@127.0.0.1:%s/postgres?sslmode=disable\n' "$PORT" >"$BASE/etc/owner.env"
printf 'ARMA_WRITER=1\nDATABASE_URL=postgres://arma_writer:e2e-local-only-writer-pw@127.0.0.1:%s/postgres\nARMA_INTERNAL_KEY=e2e-local-only-internal-key\n' "$PORT" >"$BASE/etc/writer.env"
chmod 600 "$BASE/etc/"*.env
# arma_writer proves its password here, as on the real box.
{ echo "host all arma_writer 127.0.0.1/32 scram-sha-256"; cat "$BASE/data/pg_hba.conf"; } >"$BASE/data/pg_hba.new"
mv "$BASE/data/pg_hba.new" "$BASE/data/pg_hba.conf"; [ "$MAC" = 1 ] || chown postgres:postgres "$BASE/data/pg_hba.conf"
if [ "$MAC" = 1 ]; then
  # apply-migrations.sh insists on root:root 0600 env files (GNU stat), which a Mac user cannot have: apply the same files in order with psql instead.
  for f in "$SRC"/supabase/migrations/*.sql; do sql -f "$f" >/dev/null; done
  sql -c "alter role arma_writer password 'e2e-local-only-writer-pw'"
  echo "migrations applied directly with psql (Mac): $(ls "$SRC"/supabase/migrations/*.sql | wc -l | tr -d ' ') files"
else
  ARMA_ENV_DIR="$BASE/etc" bash "$SRC/ops/realtime/apply-migrations.sh" 2>&1 | tail -4
fi

echo "== test accounts and the world switched ON (local database only)"
sql -c "insert into auth.users values ('00000000-0000-4000-8000-00000000000a'), ('00000000-0000-4000-8000-00000000000b')"
sql -c "update public.arma_config set value = 'true'::jsonb where key in ('arma_enabled', 'arma_open_access')"
BOTS="${ARMA_E2E_BOTS:-0}" # the load driver's accounts: 00000000-0000-4000-8000-<12 hex digits from 0x100 up>
[[ "$BOTS" =~ ^[0-9]+$ ]] && [ "$BOTS" -le 500 ] || { echo "ARMA_E2E_BOTS must be 0..500"; exit 2; }
[ "$BOTS" -gt 0 ] && sql -c "insert into auth.users select ('00000000-0000-4000-8000-' || lpad(to_hex(255 + g), 12, '0'))::uuid from generate_series(1, $BOTS) g"

echo "== release bundle from this tree (npm ci)"
(cd "$SRC/Web" && node scripts/area-presence-rows.mjs "$BASE/area.json" >/dev/null)
node "$SRC/ops/realtime/build-release.mjs" --out "$BASE/rel" --name e2e --area-data "$BASE/area.json" 2>&1 | tail -2

echo "== drive the world"
ARMA_E2E_BUNDLE="$BASE/rel/e2e" ARMA_E2E_PG_PORT=$PORT ARMA_E2E_AREA="$BASE/area.json" ARMA_E2E_SRC="$SRC" ARMA_E2E_BOTS="$BOTS" node "$HERE/${ARMA_E2E_DRIVER:-e2e-driver.mjs}"
