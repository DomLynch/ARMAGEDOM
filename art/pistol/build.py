import bpy, math, pathlib, json, hashlib
from mathutils import Vector
out=pathlib.Path(__file__).resolve().parents[2]/'Web/public/assets/pistol';out.mkdir(parents=True,exist_ok=True)
# Fresh factory process; only this original weapon collection is authored.
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
root=bpy.data.objects.new('Pistol',None);bpy.context.collection.objects.link(root)
def mat(n,c,metal,rough):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
steel=mat('WornSteel',(.16,.18,.19),.78,.48);grip=mat('CharcoalGrip',(.033,.037,.035),.05,.83);dark=mat('MuzzleRecess',(.008,.009,.009),.3,.7)
# Blender Z up / Y barrel becomes glTF Y up / +Z barrel (negative Blender Y).
def box(n,loc,size,m,bevel=.001):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(loc[0],-loc[2],loc[1]));o=bpy.context.object;o.name=n;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);o.parent=root
 if bevel:
  mod=o.modifiers.new('EdgeWear','BEVEL');mod.width=bevel;mod.segments=1;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
box('Slide',(0,.055,.07),(.032,.038,.18),steel,.002)
box('Frame',(0,.027,.05),(.029,.018,.145),grip)
box('GripBody',(0,-.026,-.012),(.030,.085,.040),grip,.003)
for x in [-.016,.016]:
 for i in range(6):box('GripRib',(x,-.048+i*.01,-.012),(.002,.002,.032),steel,.0003)
box('TriggerGuardBottom',(0,-.011,.042),(.013,.007,.060),steel)
box('TriggerGuardFront',(0,.005,.071),(.013,.032,.007),steel)
box('Trigger',(0,.01,.032),(.008,.024,.006),dark)
for i in range(5):
 for x in [-.0165,.0165]:box('SlideSerration',(x,.055,-.003+i*.004),(.001,.025,.0018),dark,.0002)
box('RearSight',(0,.079,-.008),(.025,.008,.008),dark)
box('FrontSight',(0,.079,.142),(.007,.007,.010),dark)
box('MuzzleFace',(0,.055,.1604),(.014,.014,.001),dark,.002)
for name,p in [('Grip',(0,0,0)),('Muzzle',(0,.055,.161))]:
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=(p[0],-p[2],p[1]);o.parent=root
bpy.ops.object.select_all(action='DESELECT')
meshes=[o for o in bpy.data.objects if o.type=='MESH']
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();bpy.context.object.name='PistolMesh'
bpy.ops.wm.save_as_mainfile(filepath=str(pathlib.Path(__file__).with_name('pistol.blend')))
bpy.ops.export_scene.gltf(filepath=str(out/'pistol.glb'),export_format='GLB',export_yup=True,export_animations=False)
file=out/'pistol.glb';j={'originalAuthorship':'Original procedural geometry authored for ARMAGEDOM; no external mesh or textures.','sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size,'meshObjects':sum(o.type=='MESH' for o in bpy.data.objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.data.objects if o.type=='MESH'),'units':'metres','forward':[0,0,1],'up':[0,1,0],'grip':[0,0,0],'muzzle':[0,.055,.161]};(out/'manifest.json').write_text(json.dumps(j,indent=2)+'\n')
print(json.dumps(j))
