"""Print the structure of the original rat GLB. Run: blender -b -P inspect.py"""
import bpy, bmesh

D = "/srv/dev-jobs/art-rat-king/"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=D + "original-rat.glb")
for o in bpy.data.objects:
    print("OBJ", o.name, o.type, tuple(round(x, 3) for x in o.location), tuple(round(x, 3) for x in o.scale), o.parent.name if o.parent else None)
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
print("BONES", [(b.name, tuple(round(x, 3) for x in b.head_local)) for b in arm.data.bones])
for o in bpy.data.objects:
    if o.type == "MESH":
        m = o.data
        print("MESH", o.name, len(m.vertices), len(m.polygons), [mat.name for mat in m.materials], [g.name for g in o.vertex_groups][:50])
        xs = [v.co.x for v in m.vertices]; ys = [v.co.y for v in m.vertices]; zs = [v.co.z for v in m.vertices]
        print("BOUNDS", min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))
        print("UV", [u.name for u in m.uv_layers])
        for mat in m.materials:
            for n in mat.node_tree.nodes:
                print("NODE", n.type, n.name, getattr(n, "image", None) and n.image.name and (n.image.name, n.image.size[:]))
print("ACTIONS", [(a.name, round(a.frame_range[0], 2), round(a.frame_range[1], 2)) for a in bpy.data.actions], bpy.context.scene.render.fps)
