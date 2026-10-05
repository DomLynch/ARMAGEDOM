#!/bin/bash
set -euo pipefail
mkdir -p results
npm ci --prefix Web --ignore-scripts --no-audit --no-fund >results/install.log 2>&1
python3 -m http.server 18916 --bind 127.0.0.1 >results/server.log 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
node inspect.mjs >results/capture.log 2>&1
