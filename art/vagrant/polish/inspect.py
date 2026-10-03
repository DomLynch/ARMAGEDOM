import bpy,json
from pathlib import Path
bpy.ops.wm.open_mainfile(filepath=str(Path(__file__).resolve().parents[1]/'output/candidate.blend'),use_scripts=False)
r=bpy.data.objects['WardenRig'];r.data.pose_position='REST'
b=bpy.data.objects['Vagrant body'];g=b.vertex_groups['Hand.R'].index
v=[x.co[:] for x in b.data.vertices if any(w.group==g and w.weight>.8 for w in x.groups)]
print('HAND_REPORT',json.dumps({'head':r.data.bones['Hand.R'].head_local[:],'tail':r.data.bones['Hand.R'].tail_local[:],'bounds':[[min(x[i] for x in v),max(x[i] for x in v)] for i in range(3)],'verts':v[::8]}))
