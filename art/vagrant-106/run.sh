#!/bin/bash
# Rebuild Web/public/assets/appearances/vagrant-106.glb on the VPS (CPU only: numpy + gltf-transform) and fetch it.
# usage: bash run.sh <results dir>   (run from a checkout that has Web/public/assets/lossless/vagrant.glb and hunters/hunter-pitborn-106.glb)
# VPS work dir /srv/dev-jobs/art-rig106 only needs these scripts and the two inputs; nothing else on the box is touched.
set -e
K="-o BatchMode=yes -i /Users/domininclynch/.ssh/binance_futures_tool"
H=root@49.12.7.18
W=/srv/dev-jobs/art-rig106
D=$(cd "$(dirname "$0")" && pwd)
A="$D/../../Web/public/assets"
OUT=${1:-.}
scp -q $K "$D/build-vagrant106.py" "$D/glbjson.py" "$D/skel.py" "$A/lossless/vagrant.glb" "$A/hunters/hunter-pitborn-106.glb" $H:$W/
ssh $K $H "cd $W && nice gltf-transform copy vagrant.glb vagrant_raw.glb | tail -1 && nice gltf-transform copy hunter-pitborn-106.glb hp106_raw.glb | tail -1 \
  && nice python3 build-vagrant106.py vagrant_raw.glb hp106_raw.glb vag106_lean.glb lean \
  && nice gltf-transform resize vag106_lean.glb vag106_1k.glb --width 1024 --height 1024 | tail -1 \
  && nice gltf-transform meshopt vag106_1k.glb vag106_1k_packed.glb --level medium | tail -1 && ls -la vag106_1k_packed.glb && sha256sum vag106_1k_packed.glb"
scp -q $K "$H:$W/vag106_1k_packed.glb" "$OUT/vagrant-106.glb"
