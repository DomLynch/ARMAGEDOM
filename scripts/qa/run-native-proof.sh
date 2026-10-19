#!/usr/bin/env bash
set -euo pipefail
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export QA_CHROMIUM_EXECUTABLE=/var/tmp/armagedom-safehouse-browser-20261018/chromium-1234/chrome-linux64/chrome
test -x "$QA_CHROMIUM_EXECUTABLE"
npm ci --ignore-scripts --no-audit --no-fund
node observer-preflight.mjs
node --check preflight/observed173.mjs
mkdir -p results
python3 -m http.server 19413 --bind 127.0.0.1 --directory export >results/native-server.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true' EXIT
for attempt in {1..40}; do
  kill -0 "$server_pid"
  if curl -fsS http://127.0.0.1:19413/release.json >/dev/null 2>&1; then break; fi
  sleep 0.25
done
kill -0 "$server_pid"
curl -fsS http://127.0.0.1:19413/release.json >/dev/null
node proof.mjs
