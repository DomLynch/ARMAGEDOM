#!/usr/bin/env bash
# build_batch.sh   (VPS, CPU only; Armagedom crowd batch 2)  rows -> MakeHuman factory (no gear set, no armour) -> reduce to 13.5k tris -> out/
# Usage: bash build_batch.sh            (run from /srv/dev-jobs/armagedom-crowd30; one body at a time under nice, waits while load >= 8)
set -uo pipefail
W=/srv/dev-jobs/armagedom-crowd30
P=/mnt/frankendom-donors/_private-ref-games/parts-lab/makehuman
S=$W/site; O=$W/build; OUT=$W/out
mkdir -p "$S/models/mixamo" "$O" "$OUT"
ln -sfn /srv/dev-jobs/opentrident-site/models/mixamo/clips "$S/models/mixamo/clips"
export OT_TOOLS=$W/tools-mh        # private copy of /root/d1/tools-mh + tools-patch/ (vrm_variants.py with the "worn" palette mode, worn_mode.py); the shared folder is not touched
cd "$OT_TOOLS"
ORDER="${REV:+[::-1]}"      # REV=1 runs the list backwards so two workers meet in the middle
for id in ${IDS:-$(python3 -c "import json;print(' '.join(list(json.load(open('$W/crowd30-rows.json'))['bodies'])$ORDER))")}; do
  [ -f "$O/$id/extended/proofs.txt" ] && { echo "skip $id (built)"; continue; }
  mkdir "$O/.lock-$id" 2>/dev/null || { echo "skip $id (other worker)"; continue; }
  while :; do l=$(cut -d' ' -f1 /proc/loadavg); awk "BEGIN{exit !($l < ${LOADMAX:-8})}" && break; echo "load $l, waiting"; sleep 30; done
  PALETTE_ROWS="$W/crowd30-palette.json" nice -n 10 python3 mh_batch.py --par 1 "$W/crowd30-rows.json" "$S" "$O" "$id" 2>&1 | tail -2
  glb="$O/$id/extended/$id-full-phone-mixamorig.glb"
  [ -f "$glb" ] || { echo "NOT BUILT $id"; continue; }
  (cd /root/mh-reduce && nice -n 10 node reduce2.mjs "$glb" "$OUT/$id.glb" 13500 2>/dev/null | tail -1 | sed "s/^/$id /")
done
echo DONE
