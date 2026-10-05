#!/usr/bin/env bash
set -euo pipefail
mkdir -p results
npm install --no-audit --no-fund >results/install.log 2>&1
node validate.cjs >results/validate.log 2>&1
cp package-lock.json results/
