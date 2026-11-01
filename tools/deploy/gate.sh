#!/bin/bash
# Release gates for N, on the laptop: rollback-saves against ALL frozen baselines, build, assets, packaging.
# Usage: gate.sh N <deploy dir containing src/Web>   (logs land in the deploy dir)
set -uo pipefail
N=${1:?release number}
D=${2:?deploy dir}
W=${ARMA_WORK:-$HOME/arma-work}
ROOTS=""
# Relative to src/Web (no drive letter): the test splits the list on ':' and Windows paths contain one.
for d in "$D"/roots/deploy*; do
  ROOTS=${ROOTS:+$ROOTS:}../../roots/$(basename "$d")
done
cd "$D/src/Web"
env ROLLBACK_BASELINE_ROOTS="$ROOTS" node --test tests/rollback-saves.test.js > ../../rb.log 2>&1
echo RB_EXIT=$? >> ../../rb.log
npm run build > ../../build.log 2>&1
echo BUILD_EXIT=$? >> ../../build.log
node scripts/verify-assets.mjs --actors assets/manifest-hollow.json --audio audio/manifest.json > ../../assets.log 2> ../../assets.err
echo ASSETS_EXIT=$? >> ../../build.log
npm run test:packaging > ../../pack.log 2>&1
echo PACK_EXIT=$? >> ../../pack.log
