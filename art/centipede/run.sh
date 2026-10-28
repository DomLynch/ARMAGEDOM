#!/bin/bash
# Runs on the VPS in /srv/dev-jobs/centipede (roach-src.glb = the roach GLB with 30 fps clips, from the roach clip-fps PR).
set -e
cd /srv/dev-jobs/centipede
nice -n 10 python3 atlas.py /srv/dev-jobs/centipede
nice -n 10 blender -b -P build.py -- /srv/dev-jobs/centipede/centipede-raw.glb 2>&1 | grep -E "^(TRIS|EXPORTED|CLIP|slot)|Traceback|Error|File " || true
gltf-transform meshopt centipede-raw.glb centipede.glb --level medium 2>&1 | tail -1
ls -la centipede-raw.glb centipede.glb
python3 anim_cmp.py roach-src.glb centipede.glb
