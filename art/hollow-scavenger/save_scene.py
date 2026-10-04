import bpy,json,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[2];out=root/'art/hollow-scavenger'
bpy.ops.wm.read_factory_settings(use_empty=True)
source=root/'Web/public/assets/hollow-scavenger/hollow-scavenger.glb'
bpy.ops.import_scene.gltf(filepath=str(source))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
for track in rig.animation_data.nla_tracks:track.mute=True
rig.animation_data.action=bpy.data.actions['HollowIdle'];rig.animation_data.action_slot=rig.animation_data.action.slots[0]
bpy.context.scene.frame_set(0)
for o in bpy.data.objects:
 if o.name=='Icosphere':o.hide_render=True
meshes=[o for o in bpy.data.objects if o.type=='MESH' and o.name!='Icosphere']
report={'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'blender':bpy.app.version_string,'meshObjects':len(meshes),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'materials':[{ 'name':m.name } for m in bpy.data.materials], 'images':[{'name':im.name,'dimensions':list(im.size),'channels':im.channels} for im in bpy.data.images if im.type=='IMAGE'],'rigBones':len(rig.data.bones),'actions':[{'name':a.name,'frameRange':list(a.frame_range)} for a in bpy.data.actions]}
(out/'blender-inventory.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'hollow-scavenger-review.blend'))
