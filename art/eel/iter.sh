#!/bin/bash
# Rebuild on the VPS and render rest and Bite stills (Workbench, CPU). Stills land in /srv/dev-jobs/eel/r/.
cd /srv/dev-jobs/eel
bash run_eel.sh 2>&1 | tail -9
mkdir -p r
nice blender -b -P render_eel.py -- eel.glb r/a 2>&1 | grep -E "^done|Traceback|Error"
nice blender -b -P render_eel.py -- eel.glb r/bite Bite ${1:-12} 2>&1 | grep -E "^done|Traceback|Error"
