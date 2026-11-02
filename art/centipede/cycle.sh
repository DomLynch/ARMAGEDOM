#!/bin/bash
# Mac side: upload the build scripts, build on the VPS, fetch centipede.glb, render the model views.
set -e
cd "$(dirname "$0")"
KEY=~/.ssh/binance_futures_tool
scp -q -i $KEY atlas.py build.py run.sh anim_cmp.py root@49.12.7.18:/srv/dev-jobs/centipede/
ssh -o BatchMode=yes -i $KEY root@49.12.7.18 'cd /srv/dev-jobs/centipede && bash run.sh 2>&1 | tail -14'
scp -q -i $KEY root@49.12.7.18:/srv/dev-jobs/centipede/centipede.glb centipede.glb
node viewer.mjs . centipede.glb "${1:-v2}" "${2:-roach_idle}" "${3:-0.2}"
