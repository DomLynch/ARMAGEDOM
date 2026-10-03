"""Read-only offline candidate inspection; no scene save or asset export."""
from pathlib import Path
import bpy,json,hashlib
ROOT=Path(__file__).resolve().parents[4]
candidate=ROOT/'art/vagrant/polish/output/candidate.blend'
bpy.ops.wm.open_mainfile(filepath=str(candidate),use_scripts=False)
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
result={'source_sha256':hashlib.sha256(candidate.read_bytes()).hexdigest(),'bone_count':len(rig.data.bones),'space':'Blender armature rest coordinates; Unity FBX conversion differs','bones':{},'weapon_bindings':{}}
for name in ('Chest','Clavicle.R','UpperArm.R','Forearm.R','Hand.R','Clavicle.L','UpperArm.L','Forearm.L','Hand.L'):
 b=rig.data.bones[name];result['bones'][name]={'parent':b.parent.name if b.parent else None,'head':list(b.head_local),'tail':list(b.tail_local),'length':b.length}
hand=rig.data.bones['Hand.R'];grip=hand.matrix_local.inverted()
for name in ('Machete','Machete handle'):
 o=bpy.data.objects[name];index=o.vertex_groups['Hand.R'].index
 weights=[sum(g.weight for g in v.groups if g.group==index) for v in o.data.vertices]
 assert min(weights)>.999,name
 result['weapon_bindings'][name]={'vertices':len(o.data.vertices),'weight_bone':'Hand.R','minimum_weight':min(weights),'armature_parent':o.parent.name,'modifier_rig':[m.object.name for m in o.modifiers if m.type=='ARMATURE'],'bone_rest_local_bounds':[[min((grip@v.co)[i] for v in o.data.vertices) for i in range(3)],[max((grip@v.co)[i] for v in o.data.vertices) for i in range(3)]]}
result['finger_bones']=[b.name for b in rig.data.bones if any(s in b.name.lower() for s in ('finger','thumb','index','pinky'))]
path=Path(__file__).with_name('rig-evidence.json');path.write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
