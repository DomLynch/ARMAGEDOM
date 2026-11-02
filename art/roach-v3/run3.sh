#!/bin/bash
set -e
cd /srv/dev-jobs/art-roach
nice -n 10 python3 atlas3.py
nice -n 10 blender -b -P build3.py -- /srv/dev-jobs/art-roach/roach3-raw.glb 2>&1 | grep -E "^(TRIS|EXPORTED)|Traceback|Error"
gltf-transform meshopt roach3-raw.glb roach3.glb --level medium 2>&1 | tail -1
python3 anim_cmp.py original-roach.glb roach3.glb
