#!/usr/bin/env bash
set -euo pipefail
mkdir -p results
(cd Web && npm ci --no-audit --no-fund) >results/install.log 2>&1
node --test Web/tests/face-recipes.test.js Web/tests/face-appearance.test.js >results/focused-tests.txt 2>&1
python3 -m http.server 18931 --bind 127.0.0.1 >results/server.log 2>&1 &
serve_pid=$!
trap 'kill "$serve_pid" 2>/dev/null || true' EXIT
node capture.mjs >results/capture.log 2>&1
