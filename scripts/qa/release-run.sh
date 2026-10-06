#!/usr/bin/env bash
set -euo pipefail
export QA_SOFTWARE_WEBGL=1
exec python3 scripts/qa/release-run.py
