#!/bin/bash
# Eel build on the VPS (CPU only): textures, Blender mesh on the salamander rig, meshopt, clip-duration check.
# Inputs next to this script: giant-salamander.glb (the committed source GLB). Output: eel.glb, tips.json.
set -e
cd /srv/dev-jobs/eel
nice -n 10 python3 atlas_eel.py .
nice -n 10 blender -b -P build_eel.py -- /srv/dev-jobs/eel/eel-raw.glb 2>&1 | grep -E "^(TRIS|EXPORTED|NORMAL|GROUPS)|Traceback|Error|line [0-9]+"
gltf-transform meshopt eel-raw.glb eel.glb --level medium 2>&1 | tail -1
python3 anim_cmp.py giant-salamander.glb eel.glb
ls -la eel.glb
