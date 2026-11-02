"""Workbench stills of an eel GLB on the VPS (no GPU): blender -b -P render_eel.py -- model.glb prefix [action frame]"""
import bpy, math, sys

args = sys.argv[sys.argv.index("--") + 1:]
glb, prefix = args[0], args[1]
act = args[2] if len(args) > 2 else None
frame = float(args[3]) if len(args) > 3 else 0
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
for o in list(bpy.data.objects):
    if o.name.startswith("Icosphere"):
        bpy.data.objects.remove(o)
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
if act:
    arm.animation_data.action = bpy.data.actions[act]
    bpy.context.scene.frame_set(int(frame), subframe=frame - int(frame))
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"
sh = sc.display.shading
sh.light = "STUDIO"
sh.color_type = "TEXTURE"
sh.show_specular_highlight = True
sc.render.resolution_x = 900
sc.render.resolution_y = 600
sc.world = bpy.data.worlds.new("w")
sc.world.color = (0.30, 0.28, 0.26)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.lens = 50
tgt = bpy.data.objects.new("tgt", None)
sc.collection.objects.link(tgt)
con = cam.constraints.new("TRACK_TO")
con.target = tgt
con.track_axis = "TRACK_NEGATIVE_Z"
con.up_axis = "UP_Y"
# (camera location, look-at point)
views = {
    "top": ((0.05, 0.15, 2.3), (0.0, 0.15, 0.0)),
    "q34": ((1.2, -1.6, 0.9), (0.0, 0.15, 0.08)),
    "head": ((0.35, -1.0, 0.28), (0.0, -0.45, 0.08)),
    "side": ((2.0, 0.15, 0.2), (0.0, 0.15, 0.08)),
}
for name, (loc, look) in views.items():
    cam.location = loc
    tgt.location = look
    bpy.context.view_layer.update()
    sc.render.filepath = "%s_%s.png" % (prefix, name)
    bpy.ops.render.render(write_still=True)
print("done")
