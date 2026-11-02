"""Workbench stills of a GLB from three angles (CPU). Run: blender -b -P render.py -- in.glb prefix [scale]"""
import bpy, math, sys

glb, prefix = sys.argv[-3], sys.argv[-2]
S = float(sys.argv[-1]) if sys.argv[-1].replace(".", "").isdigit() else 1.0
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
for o in list(bpy.data.objects):
    if o.name.startswith("Icosphere"):
        bpy.data.objects.remove(o)
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"
sh = sc.display.shading
sh.light = "STUDIO"
sh.color_type = "TEXTURE"
sh.show_specular_highlight = True
sc.render.resolution_x = 800
sc.render.resolution_y = 600
sc.world = bpy.data.worlds.new("w")
sc.world.color = (0.25, 0.23, 0.22)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.lens = 50
views = {
    "q34": ((0.62 * S, -0.75 * S, 0.5 * S), (math.radians(68), 0, math.radians(40))),
    "side": ((1.0 * S, 0.08 * S, 0.14 * S), (math.radians(90), 0, math.radians(90))),
    "back": ((-0.55 * S, 0.9 * S, 0.45 * S), (math.radians(68), 0, math.radians(-150))),
}
for name, (loc, rot) in views.items():
    cam.location = loc
    cam.rotation_euler = rot
    sc.render.filepath = "%s_%s.png" % (prefix, name)
    bpy.ops.render.render(write_still=True)
