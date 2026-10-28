"""Print the roach rig: bones, mesh bounds, materials, actions. Run: blender -b -P inspect.py -- file.glb"""
import bpy, sys

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[-1])
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
obj = [o for o in bpy.data.objects if o.type == "MESH"][0]
print("ARM", arm.name, tuple(arm.scale), tuple(arm.rotation_euler), tuple(arm.location), "MESH", obj.name, obj.parent and obj.parent.name, tuple(obj.scale))
for b in arm.data.bones:
    print("BONE", b.name, b.parent.name if b.parent else None, tuple(round(x, 3) for x in b.head_local), tuple(round(x, 3) for x in b.tail_local))
xs = [v.co for v in obj.data.vertices]
print("BBOX", [round(min(c[i] for c in xs), 3) for i in range(3)], [round(max(c[i] for c in xs), 3) for i in range(3)], len(xs), len(obj.data.polygons))
print("MATS", [m.name for m in obj.data.materials])
for a in bpy.data.actions:
    print("ACT", a.name, a.frame_range[:], bpy.context.scene.render.fps)
