#!/bin/bash
set -euo pipefail
mkdir -p results
npm ci --prefix Web --ignore-scripts --no-audit --no-fund >results/install.log 2>&1
node --test Web/tests/pickup-glow.test.js >results/focused-tests.txt 2>&1
python3 -m http.server 18915 --bind 127.0.0.1 >results/server.log 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
node capture.mjs >results/capture.log 2>&1
