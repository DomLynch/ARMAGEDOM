#!/bin/bash
# Crow build on the VPS (CPU only). Needs original-rat.glb (Web/public/assets/rat/) in the job folder.
set -e
cd /srv/dev-jobs/art-crow
nice -n 10 python3 atlas_crow.py
nice -n 10 blender -b -P build_crow.py -- /srv/dev-jobs/art-crow/crow-raw.glb 2>&1 | grep -E "^(TRIS|UNWEIGHTED|EXPORTED)|Traceback|Error|line [0-9]+"
gltf-transform meshopt crow-raw.glb crow.glb --level medium 2>&1 | tail -1
python3 anim_cmp.py original-rat.glb crow.glb
