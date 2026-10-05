#!/usr/bin/env bash
set -euo pipefail
mkdir -p results
python3 build.py >results/build.log
(cd Web && npm ci --no-audit --no-fund) >results/install.log 2>&1
python3 -m http.server 18926 --bind 127.0.0.1 >results/server.log 2>&1 &
serve_pid=$!
trap 'kill "$serve_pid" 2>/dev/null || true' EXIT
for i in $(seq 1 40);do if curl -fsS http://127.0.0.1:18926/review.html >/dev/null;then break;fi;sleep .2;done
node capture.mjs >results/capture.log 2>&1
