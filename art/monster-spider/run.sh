#!/bin/bash
# VPS: textures (Pillow/numpy), mesh (Blender 5.2 headless), meshopt (gltf-transform), then the clip and joint comparison.
set -e
cd /srv/dev-jobs/spider
nice -n 10 python3 atlas.py
nice -n 10 blender -b -P build.py -- /srv/dev-jobs/spider/spider-raw.glb 2>&1 | grep -E "^(TRIS|EXPORTED)|Traceback|Error|line [0-9]+"
gltf-transform meshopt spider-raw.glb spider.glb --level medium 2>&1 | tail -1
python3 anim_cmp.py original-roach.glb spider.glb
ls -l spider.glb
sha256sum spider.glb
