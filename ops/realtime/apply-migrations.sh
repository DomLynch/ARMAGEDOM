#!/bin/bash
# Apply supabase/migrations/*.sql to the hosted ARMAGEDOM project, from the repo, in order, once; then verify and print PASS or FAIL.
#   bash ops/realtime/apply-migrations.sh            apply what is missing, set the arma_writer password, verify
#   bash ops/realtime/apply-migrations.sh --check    verify only (read-only); changes nothing
#   bash ops/realtime/apply-migrations.sh --dry-run  list what would be applied; connects, changes nothing
# Run as root on the VPS from the release directory that holds supabase/. It reads two root-only files (see docs/MULTIPLAYER-DEPLOY-PLAN.md):
#   /etc/armagedom/owner.env    OWNER_DATABASE_URL=postgres://postgres:<password>@<host>:<port>/postgres?sslmode=require   (the project owner role)
#   /etc/armagedom/writer.env   DATABASE_URL=postgres://arma_writer[.<project-ref>]:<password>@<host>:<port>/postgres        (the writer's own URL)
# What it does, and does not:
#   - applies each migration with psql -v ON_ERROR_STOP=1 and records it (name + sha256) in public.arma_schema_migrations, so a re-run is a
#     no-op; a recorded migration whose file has since changed ABORTS the run (never re-applied, never silently skipped);
#   - sets the password of the role arma_writer to the one in writer.env, through a pipe: it appears in no argument list and is never printed;
#   - leaves everything OFF: it never writes arma_enabled or arma_open_access, and the verification FAILS if either is on;
#   - verifies in a READ ONLY transaction (ops/realtime/verify-hosted.sql): RLS on, no client write grants, only arma_me_* callable by clients.
# Connection details go to psql through a mode-600 service file in a private temp directory, never on a command line.
set -euo pipefail

MODE="${1:-apply}"
case "$MODE" in apply|--check|--dry-run) ;; *) echo "usage: $0 [--check|--dry-run]"; exit 2 ;; esac

DIR="${ARMA_ENV_DIR:-/etc/armagedom}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
MIGRATIONS="$ROOT/supabase/migrations"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}"

die() { echo "FAIL: $*" >&2; exit 1; }

# A key from a root-only env file, without sourcing it (a file can hold anything; this reads one line).
value() { # file key
  [ -f "$1" ] || die "$1 does not exist"
  mode=$(stat -c '%a %U:%G' "$1")
  [ "$mode" = "600 root:root" ] || die "$1 is $mode, want 600 root:root"
  v=$(sed -n "s/^$2=//p" "$1" | tail -n 1)
  v=${v%\"}; v=${v#\"}; v=${v%\'}; v=${v#\'}
  [ -n "$v" ] || die "$2 is missing in $1"
  printf '%s' "$v"
}

OWNER_URL=$(value "$DIR/owner.env" OWNER_DATABASE_URL)
WRITER_URL=$(value "$DIR/writer.env" DATABASE_URL)

WORK=$(mktemp -d)
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT INT TERM
export PGSERVICEFILE="$WORK/pg_service.conf"
export OWNER_URL WRITER_URL SERVICEFILE="$PGSERVICEFILE"

# Turn the owner URL into a psql service file (values read from the environment, written with mode 600).
node -e '
  const fs = require("fs");
  const u = new URL(process.env.OWNER_URL);
  const q = u.searchParams;
  const lines = ["[owner]", `host=${u.hostname}`, `port=${u.port || 5432}`, `dbname=${decodeURIComponent(u.pathname.slice(1)) || "postgres"}`,
    `user=${decodeURIComponent(u.username)}`, `password=${decodeURIComponent(u.password)}`, `sslmode=${q.get("sslmode") || "require"}`];
  fs.writeFileSync(process.env.SERVICEFILE, lines.join("\n") + "\n", { mode: 0o600 });
' || die "OWNER_DATABASE_URL is not a postgres URL"

psql_owner() { psql "service=owner" -X -q -v ON_ERROR_STOP=1 "$@"; }

psql_owner -At -c "select current_user" >/dev/null || die "cannot connect with OWNER_DATABASE_URL"
echo "connected as the owner role; migrations: $MIGRATIONS"

# Is there a registry yet? (Only a first run or a dry run may find none; any query error stops the script.)
registry=$(psql_owner -At -c "select to_regclass('public.arma_schema_migrations') is not null") || die "could not look for the migration registry"

if [ "$MODE" != "--check" ]; then
  # The registry. Private: RLS on and nothing granted to the API roles, like every other table here.
  [ "$MODE" = "--dry-run" ] || psql_owner <<'SQL'
create table if not exists public.arma_schema_migrations (
  name text primary key,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz not null default now()
);
alter table public.arma_schema_migrations enable row level security;
revoke all on public.arma_schema_migrations from public, anon, authenticated;
SQL

  applied=0; skipped=0
  for file in "$MIGRATIONS"/*.sql; do
    name=$(basename "$file")
    case "$name" in *[!A-Za-z0-9_.]*) die "unsafe migration file name: $name" ;; esac
    sha=$(sha256sum "$file" | cut -c1-64)
    recorded=""
    # A failed lookup must stop the run, never read as "not applied" (that would pipe an applied migration in again).
    [ "$registry" = "t" ] && { recorded=$(psql_owner -At -c "select sha256 from public.arma_schema_migrations where name = '$name'") || die "could not read the migration registry for $name"; }
    if [ -n "$recorded" ]; then
      [ "$recorded" = "$sha" ] || die "$name was applied from different contents (recorded $recorded, file $sha); never edit an applied migration, add a new one"
      skipped=$((skipped + 1)); echo "  skip   $name (already applied)"; continue
    fi
    if [ "$MODE" = "--dry-run" ]; then echo "  would apply $name"; continue; fi
    # One psql run per file, ONE transaction: begin, the registry row FIRST, then the migration (its own begin only warns; its commit commits both).
    # A double apply therefore hits the registry's primary key before any DDL runs, and rolls back.
    { printf "begin;\ninsert into public.arma_schema_migrations (name, sha256) values ('%s', '%s');\n" "$name" "$sha"; cat "$file"; } | psql_owner >/dev/null \
      || die "$name failed; nothing after it was applied (fix, then re-run: the ones before it are recorded and will be skipped)"
    applied=$((applied + 1)); echo "  apply  $name"
  done
  echo "migrations: $applied applied, $skipped already applied"

  if [ "$MODE" = "apply" ]; then
    # arma_writer's password from writer.env, to the database through a pipe, as a SCRAM-SHA-256 verifier computed here: the plaintext is
    # never sent (so no statement log can hold it), never echoed and never an argument.
    node -e '
      const { createHash, createHmac, pbkdf2Sync, randomBytes } = require("crypto");
      const u = new URL(process.env.WRITER_URL);
      const user = decodeURIComponent(u.username);
      if (user !== "arma_writer" && !user.startsWith("arma_writer.")) { console.error("the writer URL must use the role arma_writer (or arma_writer.<project-ref> on the pooler)"); process.exit(3); }
      const password = decodeURIComponent(u.password);
      if (password.length < 16) { console.error("the arma_writer password is shorter than 16 characters"); process.exit(3); }
      const salt = randomBytes(16), iterations = 4096;
      const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
      const hmac = (key, text) => createHmac("sha256", key).update(text).digest();
      const stored = createHash("sha256").update(hmac(salted, "Client Key")).digest();
      const verifier = "SCRAM-SHA-256$" + iterations + ":" + salt.toString("base64") + "$" + stored.toString("base64") + ":" + hmac(salted, "Server Key").toString("base64");
      process.stdout.write("alter role arma_writer with login password " + String.fromCharCode(39) + verifier + String.fromCharCode(39) + ";\n");
    ' | psql_owner >/dev/null || die "could not set the arma_writer password (the URL must name arma_writer with a password of 16+ characters)"
    echo "arma_writer password set from writer.env (as a SCRAM verifier; not shown)"
  fi
fi

[ "$MODE" = "--dry-run" ] && { echo "dry run: nothing changed"; exit 0; }

# Every migration file must be recorded, then the read-only checks.
missing=""
registry=$(psql_owner -At -c "select to_regclass('public.arma_schema_migrations') is not null") || die "could not look for the migration registry"
for file in "$MIGRATIONS"/*.sql; do
  name=$(basename "$file")
  count=0
  [ "$registry" = "t" ] && { count=$(psql_owner -At -c "select count(*) from public.arma_schema_migrations where name = '$name'") || die "could not read the migration registry for $name"; }
  [ "$count" = "1" ] || missing="$missing $name"
done
[ -z "$missing" ] || die "not applied:$missing"
if psql_owner -f "$HERE/verify-hosted.sql" >"$WORK/verify.out" 2>"$WORK/verify.err"; then
  cat "$WORK/verify.out"
  echo "PASS: ARMAGEDOM schema is applied and verified; everything is OFF (arma_enabled and arma_open_access are false)."
else
  cat "$WORK/verify.out" "$WORK/verify.err"
  echo "FAIL: verification failed (see above)." >&2
  exit 1
fi
