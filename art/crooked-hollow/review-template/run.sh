#!/usr/bin/env bash
set -euo pipefail
cd Web
npm install --no-package-lock --silent
node --test tests/crooked-hollow.test.js >../focused-tests.txt
cd ..
python3 -m http.server 8898 >http.log 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
node capture.mjs
ffmpeg -loglevel error -framerate 8 -i proof/frame-%03d.png -vf "pad=ceil(iw/2)*2:ceil(ih/2)*2" -c:v libx264 -pix_fmt yuv420p proof/crooked-hollow.mp4
