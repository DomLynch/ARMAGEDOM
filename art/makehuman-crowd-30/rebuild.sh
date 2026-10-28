#!/usr/bin/env bash
# rebuild.sh  (VPS)  after a rect fix in crowd30_rows.py: regenerate rows (same seed, so only the rects change), drop the listed bodies, rebuild them one at a time
W=/srv/dev-jobs/armagedom-crowd30
cd "$W" || exit 1
python3 crowd30_rows.py . first30.json
for id in "$@"; do rm -rf "$W/build/$id" "$W/build/.lock-$id" "$W/out/$id.glb"; done
IDS="$*" LOADMAX=1000 bash build_batch.sh > rebuild.log 2>&1
