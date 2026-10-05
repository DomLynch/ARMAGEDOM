#!/usr/bin/env bash
set -euo pipefail
(cd Web && npm ci --no-audit --no-fund) >results/install.log 2>&1
python3 -m http.server 18927 --bind 127.0.0.1 >results/server.log 2>&1 &
serve_pid=$!
trap 'kill "$serve_pid" 2>/dev/null || true' EXIT
node capture.mjs >results/capture.log 2>&1
