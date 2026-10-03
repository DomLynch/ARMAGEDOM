"""Light read-only authoring inspection; no renders, bake, export or rig edits."""
from pathlib import Path
import json
import bpy
root = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(root / 'output/candidate.blend'), use_scripts=False)
body = bpy.data.objects['Vagrant body']
head_group = body.vertex_groups['Head'].index
head = [v.co for v in body.data.vertices if any(g.group == head_group and g.weight > .9 for g in v.groups)]
bounds = [[min(v[i] for v in head), max(v[i] for v in head)] for i in range(3)]
size = [b-a for a,b in bounds]
assert .13 < size[1] < .35, ('head depth collapsed or inflated',size)
assert .11 < size[0] < .3, ('head width',size)
report = {'status':'PASS','head_width_depth_height_m':size,'scope':'authored rest mesh only; no runtime acceptance claim'}
(root/'output/volume-check.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
