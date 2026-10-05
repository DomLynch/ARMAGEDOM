#!/usr/bin/env bash
set -euo pipefail
cd Web
npm install --no-package-lock --silent
cd ..
node check.mjs >checks.txt
python3 -m http.server 8899 >http.log 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
node capture.mjs
