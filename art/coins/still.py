"""Still of the three coin assets side by side on a dark ground (Blender, Workbench, CPU).
Run: blender -b -P still.py -- <dir with the three GLBs> <out.png>"""
import bpy, math, sys
from mathutils import Vector

D, OUT = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
for i, name in enumerate(["cash-coin", "cash-pile", "cash-stack"]):
    bpy.ops.import_scene.gltf(filepath=f"{D}/{name}.glb")
    root = bpy.context.selected_objects
    for o in root:
        o.location.x += (i - 1) * 1.0
scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
sh = scene.display.shading
sh.light = "STUDIO"
sh.color_type = "VERTEX"
sh.show_specular_highlight = True
scene.render.resolution_x, scene.render.resolution_y = 1200, 600
scene.world = bpy.data.worlds.new("w")
scene.world.color = (0.07, 0.08, 0.09)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(cam)
cam.location = (0, -2.4, 1.5)
cam.rotation_euler = (Vector((0, 2.4, -1.35)).to_track_quat("-Z", "Y")).to_euler()
cam.data.lens = 28
scene.camera = cam
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("STILL", OUT)
