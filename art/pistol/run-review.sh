#!/usr/bin/env bash
set -euo pipefail
cd Web
npm ci --silent
npm install --no-save --package-lock=false playwright gltf-validator --silent
cd ..
python3 -m http.server 8897 >art/pistol/http.log 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
node art/pistol/capture.mjs
node --input-type=module - <<'JS'
import fs from 'node:fs';import validator from './Web/node_modules/gltf-validator/index.js';
const report=await validator.validateBytes(new Uint8Array(fs.readFileSync('Web/public/assets/pistol/pistol.glb')));fs.writeFileSync('art/pistol/validator.json',JSON.stringify(report,null,2));if(report.issues.numErrors)throw Error('Pistol validation errors');
JS
ffmpeg -loglevel error -framerate 8 -i art/pistol/proof/frame-%03d.png -c:v libx264 -pix_fmt yuv420p art/pistol/proof/pistol-moving.mp4
