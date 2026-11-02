#!/bin/sh
# One command that proves the env files exist, are root-only, and are READABLE BY THE UNITS' OWN CONFINEMENT, without printing a value.
#   sh ops/realtime/check-env.sh [writer|presence]      (default: both; run as root on the VPS)
# For each service it (1) checks the file is root:root 0600, then (2) starts a transient systemd unit that loads the file exactly as the
# real unit does (EnvironmentFile, DynamicUser, ProtectSystem=strict) and prints, per required name, "set (N chars)" or "MISSING".
# Exit status is non-zero if a file is wrong or any required name is missing. Values are never printed.
set -eu
DIR="${ARMA_ENV_DIR:-/etc/armagedom}"
WRITER_NEEDS="ARMA_WRITER DATABASE_URL SUPABASE_URL SUPABASE_ANON_KEY ARMA_INTERNAL_KEY"
PRESENCE_NEEDS="ARMA_PRESENCE SUPABASE_URL SUPABASE_ANON_KEY ARMA_INTERNAL_KEY ARMA_AREA_DATA"

check() {
  name="$1"; needs="$2"; file="$DIR/$name.env"
  [ -f "$file" ] || { echo "$name: $file does not exist"; return 1; }
  mode=$(stat -c '%a %U:%G' "$file")
  [ "$mode" = "600 root:root" ] || { echo "$name: $file is $mode, want 600 root:root"; return 1; }
  echo "$name: $file is $mode"
  systemd-run --quiet --wait --pipe --collect \
    -p "EnvironmentFile=$file" -p DynamicUser=yes -p ProtectSystem=strict -p ProtectHome=yes -p PrivateTmp=yes -p NoNewPrivileges=yes \
    /usr/bin/env node -e '
      let bad = 0;
      for (const key of process.argv.slice(1)) {
        const v = process.env[key];
        console.log("  " + key + ": " + (v ? "set (" + v.length + " chars)" : "MISSING"));
        if (!v) bad = 1;
      }
      process.exit(bad);
    ' $needs
}

status=0
case "${1:-both}" in
  writer) check writer "$WRITER_NEEDS" || status=1 ;;
  presence) check presence "$PRESENCE_NEEDS" || status=1 ;;
  both) check writer "$WRITER_NEEDS" || status=1; check presence "$PRESENCE_NEEDS" || status=1 ;;
  *) echo "usage: $0 [writer|presence]"; exit 2 ;;
esac
# The same shared key must be in both files (presence calls the writer's /internal routes with it): compare hashes, never values.
if [ "${1:-both}" = both ]; then
  a=$(sed -n 's/^ARMA_INTERNAL_KEY=//p' "$DIR/writer.env" | sha256sum | cut -c1-12)
  b=$(sed -n 's/^ARMA_INTERNAL_KEY=//p' "$DIR/presence.env" | sha256sum | cut -c1-12)
  [ "$a" = "$b" ] && echo "ARMA_INTERNAL_KEY is the same in both files" || { echo "ARMA_INTERNAL_KEY DIFFERS between the files"; status=1; }
fi
exit $status
