import bpy, json
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="/srv/dev-jobs/art-roach/wolf.glb")
obj = [o for o in bpy.data.objects if o.type == "MESH" and not o.name.startswith("Icosphere")][0]
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
m = obj.data
gname = {g.index: g.name for g in obj.vertex_groups}
img = bpy.data.images.load("/srv/dev-jobs/art-roach/wolf-atlas.png")
W, H = img.size
px = list(img.pixels)
uv = m.uv_layers.active.data
bones = {b.name: tuple(round(x, 3) for x in b.head_local) for b in arm.data.bones}
out = []
for p in m.polygons:
    us = [uv[l].uv for l in p.loop_indices]
    u = sum(x[0] for x in us) / len(us)
    v = sum(x[1] for x in us) / len(us)
    tx, ty = int(u * W), int(v * H)
    i = (ty * W + tx) * 4
    g = {}
    for vi in p.vertices:
        for ge in m.vertices[vi].groups:
            g[gname[ge.group]] = g.get(gname[ge.group], 0) + ge.weight
    dg = max(g.items(), key=lambda kv: kv[1])[0] if g else "root"
    c = p.center
    out.append([tx, ty, round(c.x, 4), round(c.y, 4), round(c.z, 4), dg, [round(px[i + k], 3) for k in range(3)], round(p.area, 6)])
json.dump({"W": W, "H": H, "bones": bones, "polys": out}, open("/srv/dev-jobs/art-roach/wolf_polys.json", "w"))
print("POLYS", len(out), W, H, bones.get("head"), bones.get("jaw"), bones.get("ear_L"), bones.get("tail3"))
