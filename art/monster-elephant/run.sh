#!/bin/bash
# Elephant build on the VPS (CPU only): mesh in Blender, atlas in numpy/Pillow, swap into the wolf GLB, meshopt. Needs wolf.glb (the unchanged
# Web/public/assets/wolf/wolf.glb) next to the scripts.
set -e
cd /srv/dev-jobs/elephant
nice -n 10 blender -b -P elephant_mesh.py -- /srv/dev-jobs/elephant/wolf.glb /srv/dev-jobs/elephant/elephant_mesh.npz 2>&1 | grep -E "^TRIS|Traceback|Error"
nice -n 10 python3 elephant_tex.py elephant_mesh.npz colour.png emissive.png 512
python3 elephant_pack.py elephant_mesh.npz colour.png emissive.png elephant_mesh.json colour.webp emissive.webp
node elephant_swap.mjs wolf.glb elephant_mesh.json colour.webp emissive.webp elephant-raw.glb
gltf-transform meshopt elephant-raw.glb elephant.glb --level medium 2>&1 | tail -1
ls -l elephant.glb
sha256sum elephant.glb
