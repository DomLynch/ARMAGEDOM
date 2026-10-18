#!/usr/bin/env bash
set -euo pipefail
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export QA_CHROMIUM_EXECUTABLE=/var/tmp/armagedom-safehouse-browser-20261018/chromium-1234/chrome-linux64/chrome
test -x "$QA_CHROMIUM_EXECUTABLE"
npm ci --prefix scripts/qa --ignore-scripts --no-audit --no-fund
exec node scripts/qa/run-checked.mjs
