#!/bin/bash
# Rat King build on the VPS: coat texture, Blender rebuild, meshopt, clip-duration check, stills.
set -e
cd /srv/dev-jobs/art-rat-king
nice -n 10 python3 coat.py orig-original-coat.png king-coat.png
nice -n 10 blender -b -P build.py -- /srv/dev-jobs/art-rat-king/rat-king-raw.glb 2>&1 | grep -E "^(TRIS|EXPORTED|ORIGCOL|HEAD)|Traceback|Error"
gltf-transform meshopt rat-king-raw.glb rat-king.glb --level medium 2>&1 | tail -1
python3 anim_cmp.py original-rat.glb rat-king.glb
mkdir -p r
nice -n 10 blender -b -P render.py -- rat-king-raw.glb /srv/dev-jobs/art-rat-king/r/king 0.7 2>&1 | grep -E "Traceback|Error:" || true
ls -la rat-king.glb
