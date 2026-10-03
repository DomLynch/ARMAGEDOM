from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parent;OUT=ROOT/'output'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'diagnostic-smoothed.blend'),use_scripts=False)
scene=bpy.context.scene
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');rig.data.pose_position='REST'
for name in ('Protection vest','Backpack'):bpy.data.objects[name].hide_render=True
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=4
scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=480;scene.render.resolution_y=600;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Review world');scene.world.color=(.12,.12,.12)
for name,loc,energy,size in [('Key',(-3,-4,5),450,4),('Fill',(3,-2,3),250,3)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('Review');cam=bpy.data.objects.new('Review',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.type='ORTHO'
(OUT/'smooth-review').mkdir(exist_ok=True)
for name,target,offset,size in [('grip',(-.477,-.06,1),(0,-.7,.18),.25),('front',(0,0,1),(0,-4,.1),2.2)]:
 cam.location=Vector(target)+Vector(offset);cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();camdata.ortho_scale=size
 scene.render.filepath=str(OUT/'smooth-review'/f'{name}.png');bpy.ops.render.render(write_still=True)
