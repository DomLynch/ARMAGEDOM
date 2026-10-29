#!/bin/bash
# Build a lossless humanoid (all five share the 19-joint WardenRig) on the 106 rig on the VPS (CPU, numpy only) and fetch the GLBs.
# usage: [NAME=vagrant|orc|revenant|warlock|warlord] bash run.sh <results dir>
# VPS work dir /srv/dev-jobs/art-rig106 holds: the 106-joint template base-human-xbot-full-phone-mixamorig.glb (OpenTrident
# models/custom) and clips/*.glb (Mixamo clip files from OpenTrident models/mixamo/clips, picked in REPORT.md).
set -e
K="-o BatchMode=yes -i /Users/domininclynch/.ssh/binance_futures_tool"
H=root@49.12.7.18
W=/srv/dev-jobs/art-rig106
D=$(cd "$(dirname "$0")" && pwd)
NAME=${NAME:-vagrant}
OUT=${1:-.}
SRC="$D/../../Web/public/assets/lossless/$NAME.glb"
scp -q $K "$D/build106.py" "$D/glbjson.py" "$D/skel.py" "$SRC" $H:$W/
CL="Idle=clips/Idle.glb Walk=clips/Walk.glb Run=clips/Run.glb Attack=clips/Attack.glb Hit=clips/Hit.glb Death=clips/Death.glb"
T=base-human-xbot-full-phone-mixamorig.glb
ssh $K $H "cd $W && nice gltf-transform copy $NAME.glb ${NAME}_raw.glb 2>&1 | tail -1 && for m in full lean; do nice python3 build106.py ${NAME}_raw.glb $T ${NAME}_\$m.glb \$m $CL | grep -E 'OK|grip|meshes'; nice gltf-transform meshopt ${NAME}_\$m.glb ${NAME}_\${m}_packed.glb --level medium 2>&1 | tail -1; done; ls -la ${NAME}_*.glb"
scp -q $K "$H:$W/${NAME}_*.glb" "$OUT/"
