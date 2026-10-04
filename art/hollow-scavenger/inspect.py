import bpy,json,sys
from pathlib import Path
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(__file__).resolve().parents[2]/'Web/public/assets/donor/warrior.glb'))
for o in bpy.data.objects:
 if o.type=='ARMATURE':
  print('RIG',o.name,len(o.data.bones));print('NLA',[(t.name,[(s.name,s.frame_start,s.frame_end,s.action.name) for s in t.strips]) for t in o.animation_data.nla_tracks]);print('ACTION',o.animation_data.action)
print('ACTIONS',[(a.name,a.frame_range[:],len(a.slots)) for a in bpy.data.actions])
for o in bpy.data.objects:
 if o.type=='MESH':print('MESH',o.name,len(o.data.polygons),[m.name for m in o.data.materials],len(o.vertex_groups))
