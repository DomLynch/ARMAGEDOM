#!/bin/sh
# Rebuilds the three hub NPC GLBs into Web/public/assets/npc/ from the shipped reduced MakeHuman crowd bodies plus one Mixamo idle clip each
# (retargeted onto the 106-joint rig, see PROVENANCE.md). usage (VPS, repo root): sh art/hub-npcs/build-all.sh [body dir] [mixamo clip dir]
set -eu
SRC="${1:-Web/public/assets/crowd}"
CLIPS="${2:-/srv/dev-jobs/opentrident-site/models/mixamo/clips}"
OUT=Web/public/assets/npc
mkdir -p "$OUT"
node art/hub-npcs/build.mjs "$SRC/mh-male-01.glb" "$CLIPS/107900901-breathing-idle.glb" "$OUT/npc-vendor-brannock.glb" '{"desat":0.22,"gamma":1.1,"tint":[1.0,0.93,0.82],"grime":0.7,"seed":11}' "${DY_VENDOR:-0}"
node art/hub-npcs/build.mjs "$SRC/mh-gen-v2-0036.glb" "$CLIPS/110210901-looking.glb" "$OUT/npc-medic-ines.glb" '{"desat":0.15,"gamma":1.05,"tint":[0.93,0.97,0.98],"lift":[0.8,0.88,0.88],"grime":0.45,"seed":22}' "${DY_MEDIC:-0}"
node art/hub-npcs/build.mjs "$SRC/mh-gen-v2-0020.glb" "$CLIPS/104340901-old-man-idle.glb" "$OUT/npc-quest-marrow.glb" '{"desat":0.35,"gamma":1.18,"tint":[0.95,0.88,0.8],"grime":0.8,"seed":33}' "${DY_QUEST:-0}"
ls -l "$OUT"
