"""Dump the rat materials and save the coat texture. Run: blender -b -P mats.py"""
import bpy

D = "/srv/dev-jobs/art-rat-king/"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=D + "original-rat.glb")
obj = [o for o in bpy.data.objects if o.name == "ARM Original Rat"][0]
print("ATTRS", [(a.name, a.domain, a.data_type) for a in obj.data.attributes])
for m in obj.data.materials:
    for n in m.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            print("MAT", m.name, [tuple(round(c, 3) for c in n.inputs[k].default_value) for k in ("Base Color",)], n.inputs["Roughness"].default_value, n.inputs["Metallic"].default_value)
for i in bpy.data.images:
    print("IMG", i.name, i.size[:], i.filepath)
    i.filepath_raw = D + "orig-" + i.name + ".png"
    i.file_format = "PNG"
    i.save()
