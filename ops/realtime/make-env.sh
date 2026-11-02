#!/bin/bash
# Creates /etc/armagedom/writer.env and presence.env ON the VPS with the secrets generated there, never echoed, never in a command line, a chat or the repo.
#   sudo bash ops/realtime/make-env.sh --supabase-url https://<ref>.supabase.co --anon-key <publishable key> --pooler-host <aws-0-REGION.pooler.supabase.com> [--presence-port 8894]
# Only PUBLIC values are arguments (the project URL, the publishable key, the pooler host). It generates:
#   - the arma_writer password (48 alphanumeric characters, so the connection string needs no escaping) inside DATABASE_URL in writer.env;
#   - ARMA_INTERNAL_KEY (64 hex characters), the same value in both files;
#   - /etc/armagedom/arma_writer.verifier.sql: ONE statement, `alter role arma_writer with login password '<SCRAM-SHA-256 verifier>'`. A verifier is not the
#     password: whoever applies this line (the Supabase SQL tool, or psql as the owner) can set the role up but cannot learn or reuse the password.
# Both services start with their flag OFF (ARMA_WRITER=0, ARMA_PRESENCE=0): the process exits 0 and nothing listens until someone flips it deliberately.
# It refuses to overwrite an existing file. Files are root:root 0600; the directory 0700. Run as root.
set -euo pipefail
umask 077
DIR="${ARMA_ENV_DIR:-/etc/armagedom}"
arg() { local i; for ((i = 1; i < ${#ARGS[@]}; i++)); do if [ "${ARGS[$i-1]}" = "$1" ]; then printf '%s' "${ARGS[$i]}"; return 0; fi; done; return 0; }
ARGS=("$@")
SUPABASE_URL=$(arg --supabase-url); ANON=$(arg --anon-key); HOST=$(arg --pooler-host); PORT=$(arg --presence-port); PORT=${PORT:-8894}
die() { echo "make-env: $1" >&2; exit 2; }
[ "$(id -u)" = 0 ] || die "run as root"
[[ "$SUPABASE_URL" =~ ^https://([a-z0-9]{20})\.supabase\.co$ ]] || die "--supabase-url must be https://<20-char ref>.supabase.co"
REF="${BASH_REMATCH[1]}"
[[ "$HOST" =~ ^[a-z0-9.-]+\.pooler\.supabase\.com$ ]] || die "--pooler-host must be the project's *.pooler.supabase.com host"
[ "${#ANON}" -ge 20 ] && [[ "$ANON" != *[[:space:]]* ]] || die "--anon-key looks wrong (the publishable key, a single token)"
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1024 ] && [ "$PORT" -le 65000 ] || die "--presence-port must be a port number"
case "$PORT" in 8787|8788|8793|8891) die "port $PORT belongs to another service" ;; esac
ss -ltn | grep -q "127.0.0.1:$PORT " && die "port $PORT is already in use on this host; pick another with --presence-port"
for f in writer.env presence.env arma_writer.verifier.sql; do [ -e "$DIR/$f" ] && die "$DIR/$f already exists; refusing to overwrite (move it away deliberately first)"; done
mkdir -p "$DIR"; chmod 700 "$DIR"; chown root:root "$DIR"

PW=$(head -c 96 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)
KEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
[ "${#PW}" = 48 ] && [ "${#KEY}" = 64 ] || die "could not gather randomness"

{
  echo "ARMA_WRITER=0"
  echo "DATABASE_URL=postgres://arma_writer.${REF}:${PW}@${HOST}:5432/postgres?sslmode=require"
  echo "SUPABASE_URL=${SUPABASE_URL}"
  echo "SUPABASE_ANON_KEY=${ANON}"
  echo "ARMA_INTERNAL_KEY=${KEY}"
  echo "WRITER_PORT=8891"
} >"$DIR/writer.env"
{
  echo "ARMA_PRESENCE=0"
  echo "SUPABASE_URL=${SUPABASE_URL}"
  echo "SUPABASE_ANON_KEY=${ANON}"
  echo "ARMA_INTERNAL_KEY=${KEY}"
  echo "ARMA_AREA_DATA=/opt/armagedom-realtime/current/server/data/area-presence.json"
  echo "PRESENCE_PORT=${PORT}"
  echo "WRITER_URL=http://127.0.0.1:8891"
} >"$DIR/presence.env"

# The SCRAM-SHA-256 verifier (RFC 5802 / Postgres): the same computation apply-migrations.sh uses. The password comes in through the environment of this
# one process, not an argument, and only the verifier is written.
ARMA_PW="$PW" node -e '
  const { createHash, createHmac, pbkdf2Sync, randomBytes } = require("crypto");
  const password = process.env.ARMA_PW, salt = randomBytes(16), iterations = 4096;
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const hmac = (key, text) => createHmac("sha256", key).update(text).digest();
  const stored = createHash("sha256").update(hmac(salted, "Client Key")).digest();
  const verifier = "SCRAM-SHA-256$" + iterations + ":" + salt.toString("base64") + "$" + stored.toString("base64") + ":" + hmac(salted, "Server Key").toString("base64");
  process.stdout.write("alter role arma_writer with login password " + String.fromCharCode(39) + verifier + String.fromCharCode(39) + ";\n");
' >"$DIR/arma_writer.verifier.sql"
unset PW KEY
chown root:root "$DIR"/*; chmod 600 "$DIR"/*
echo "wrote $DIR/writer.env, $DIR/presence.env (flags OFF, presence port $PORT) and $DIR/arma_writer.verifier.sql (one statement, a verifier, not the password)."
echo "next: apply that one statement to the project (Supabase SQL tool), then: sh ops/realtime/check-env.sh"
