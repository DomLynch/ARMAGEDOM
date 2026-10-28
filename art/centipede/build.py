"""Giant centipede on the ARM_RoachRig (Blender 5.2 headless, CPU). Run: blender -b -P build.py -- out.glb

Keeps the roach armature (27 joints, names, six clips) and adds 10 leg pairs of leg/shin/foot bones (60 joints) that copy the
middle roach leg pair, with the walk and run clips phase-shifted along the body (a leg wave); bite, hit, death and idle copy
the middle pair unshifted. The three original leg pairs are moved along the body (rest pose translated only). The roach mesh is
discarded; the body, head, legs, pincers and antennae are built here and skinned to those bones."""
import bpy, bmesh, math, random, sys
from mathutils import Vector

OUT = sys.argv[-1]
D = "/srv/dev-jobs/centipede/"
random.seed(2810)

N, Y0, P = 11, -0.140, 0.05  # body segments, front edge, segment pitch (Blender units, the model is scaled 3x in game)
ORIG_AT = {0: 2, 1: 5, 2: 8}  # roach leg pair index -> segment it moves to
ORIG_Y = {0: -0.105, 1: -0.005, 2: 0.12}  # roach rest y of each leg pair
SIDES = ("L", "R")
BODY_S = 14

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30  # the roach clips are 30 fps; 24 would trim the last frame of each
bpy.ops.import_scene.gltf(filepath=D + "roach-src.glb")
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
for o in list(bpy.data.objects):
    if o.type == "MESH":
        bpy.data.objects.remove(o)
for m in list(bpy.data.meshes):
    bpy.data.meshes.remove(m)


def seg_y(i):
    return Y0 + (i + 0.5) * P


# ---------------------------------------------------------------- armature: move the roach legs, add the new pairs
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
tmpl = {}
for side in SIDES:
    tmpl[side] = [(eb[f"{k}_1{side}"].head.copy(), eb[f"{k}_1{side}"].tail.copy(), eb[f"{k}_1{side}"].roll) for k in ("leg", "shin", "foot")]
for pair, seg in ORIG_AT.items():
    # the roach's front and rear pairs slant; every centipede pair takes the middle pair's rest shape so the rows are even
    off = Vector((0, seg_y(seg) - (-0.005), 0))
    for side in SIDES:
        for (h, t, roll), k in zip(tmpl[side], ("leg", "shin", "foot")):
            b = eb[f"{k}_{pair}{side}"]
            b.head = h + off
            b.tail = t + off
            b.roll = roll
new_pairs = [i for i in range(N) if i not in ORIG_AT.values()]
for i in new_pairs:
    for side in SIDES:
        prev = eb["body"]
        for (h, t, roll), k in zip(tmpl[side], ("leg", "shin", "foot")):
            b = eb.new(f"{k}_c{i}{side}")
            off = Vector((0, seg_y(i) - (-0.005), 0))
            b.head = h + off
            b.tail = t + off
            b.roll = roll
            b.parent = prev
            b.use_connect = k != "leg"
            prev = b
bpy.ops.object.mode_set(mode="OBJECT")


def leg_names(i, side):
    pair = {v: k for k, v in ORIG_AT.items()}.get(i)
    return [f"{k}_{pair}{side}" for k in ("leg", "shin", "foot")] if pair is not None else [f"{k}_c{i}{side}" for k in ("leg", "shin", "foot")]


# ---------------------------------------------------------------- animation: copy the middle leg pair onto the new bones
def period_shift(name, i):
    n = {"roach_walk": 18, "roach_run": 12}.get(name)
    return (n, ((N - 1 - i) * (n // 6)) % n) if n else (None, 0)


for act in bpy.data.actions:
    arm.animation_data.action = act
    try:
        arm.animation_data.action_slot = act.slots[0]
    except Exception as e:
        print("slot", e)
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    samples = {}
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        for side in SIDES:
            for k in ("leg", "shin", "foot"):
                pb = arm.pose.bones[f"{k}_1{side}"]
                samples[(f, k, side)] = (pb.location.copy(), pb.rotation_quaternion.copy(), pb.scale.copy())
    first_last = [tuple(samples[(f, "leg", "L")][1]) for f in (f0, f1)]
    print("CLIP", act.name, f0, f1, "ends equal", all(abs(a - b) < 1e-5 for a, b in zip(*first_last)))
    wave = act.name in ("roach_walk", "roach_run")  # the walk and run clips re-time every pair, original ones included
    for i in (range(N) if wave else new_pairs):
        n, shift = period_shift(act.name, i)
        for side in SIDES:
            for k, nm in zip(("leg", "shin", "foot"), leg_names(i, side)):
                pb = arm.pose.bones[nm]
                pb.rotation_mode = "QUATERNION"
                for f in range(f0, f1 + 1):
                    sf = f if not n else f0 + ((f - f0 - shift) % n)
                    loc, rot, scl = samples[(sf, k, side)]
                    pb.location, pb.rotation_quaternion, pb.scale = loc, rot, scl
                    pb.keyframe_insert("location", frame=f)
                    pb.keyframe_insert("rotation_quaternion", frame=f)
                    pb.keyframe_insert("scale", frame=f)
bpy.context.scene.frame_set(0)
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.location = (0, 0, 0)
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.scale = (1, 1, 1)

# ---------------------------------------------------------------- mesh
mesh = bpy.data.meshes.new("ARM Giant Centipede")
obj = bpy.data.objects.new("ARM Giant Centipede", mesh)
bpy.context.scene.collection.objects.link(obj)
for b in arm.data.bones:
    obj.vertex_groups.new(name=b.name)
gidx = {g.name: g.index for g in obj.vertex_groups}
bm = bmesh.new()
dl = bm.verts.layers.deform.verify()
uvl = bm.loops.layers.uv.new("UVMap")
ATLAS_W, ATLAS_H = 1024.0, 512.0
REG = {"shell": (0, 0, 512, 160), "legs": (512, 0, 512, 128), "head": (512, 128, 512, 192), "pincer": (512, 320, 256, 128), "ant": (768, 320, 256, 64)}


def uv(region, u, v):
    x, y, w, h = REG[region]
    return ((x + u * w) / ATLAS_W, 1.0 - (y + v * h) / ATLAS_H)  # v = 0 is the top row of the region


def setw(vert, weights):
    for name, w in weights.items():
        vert[dl][gidx[name]] = w


def tube(path, radii, weights, region, sides=5, cap=True, flatten=1.0):
    """Skinned tube along a polyline. weights(index) -> {bone: w}. u around, v root to tip."""
    rings = []
    for k, p in enumerate(path):
        a = (path[min(k + 1, len(path) - 1)] - path[max(k - 1, 0)]).normalized()
        t = a.cross(Vector((0, 0, 1)))
        if t.length < 1e-4:
            t = a.cross(Vector((1, 0, 0)))
        t.normalize()
        b = a.cross(t).normalized()
        ring = []
        for j in range(sides):
            ang = 2 * math.pi * j / sides
            v = bm.verts.new(p + t * math.cos(ang) * radii[k] + b * math.sin(ang) * radii[k] * flatten)
            setw(v, weights(k))
            ring.append(v)
        rings.append(ring)
    faces = []
    for k in range(len(path) - 1):
        for j in range(sides):
            j2 = (j + 1) % sides
            f = bm.faces.new((rings[k][j], rings[k][j2], rings[k + 1][j2], rings[k + 1][j]))
            for l, (kk, jj) in zip(f.loops, ((k, j), (k, j + 1), (k + 1, j + 1), (k + 1, j))):
                l[uvl].uv = uv(region, jj / sides, kk / (len(path) - 1))
            faces.append(f)
    if cap:
        tipv = bm.verts.new(path[-1] + (path[-1] - path[-2]).normalized() * radii[-1] * 1.2)
        setw(tipv, weights(len(path) - 1))
        for j in range(sides):
            j2 = (j + 1) % sides
            f = bm.faces.new((rings[-1][j], rings[-1][j2], tipv))
            for l in f.loops:
                l[uvl].uv = uv(region, 0.5, 1.0)
            faces.append(f)
    return faces


# ---- body: 13 plates, each a dome with a stepped rear edge, then a tapered tail
G = [0.86, 0.96, 1.02, 1.045, 1.04, 1.0]  # plate profile front to back
rings = []  # (y, scale, seg, ring-in-seg)
for i in range(N):
    for k, g in enumerate(G):
        rings.append((Y0 + (i + k / (len(G) - 1)) * P, g, i, k))
tail_n = 4
for k in range(1, tail_n + 1):
    rings.append((Y0 + N * P + 0.012 * k, 0.9 - 0.2 * k, N - 1, len(G) - 1))
TOTAL = N * P


def width_at(y):
    t = (y - Y0) / TOTAL
    w = 0.068 + 0.010 * min(1, t / 0.25)
    if t > 0.55:
        w *= 1 - 0.38 * ((t - 0.55) / 0.45) ** 1.4
    return w


def body_weights(y):
    t = min(1.0, max(0.0, (y - 0.1) / 0.1))
    t = t * t * (3 - 2 * t)
    return {"body": 1 - t, "abdomen": t} if t > 0 else {"body": 1.0}


verts_r = []
for (y, g, seg, k) in rings:
    w = width_at(y) * g
    ring = []
    for j in range(BODY_S):
        phi = -math.pi + 2 * math.pi * j / BODY_S
        sx, cz = math.sin(phi), math.cos(phi)
        x = w * math.copysign(abs(sx) ** 0.72, sx)
        top, bot = 0.046 * (w / 0.076) ** 0.5, 0.032 * (w / 0.076) ** 0.5
        zc = 0.062
        z = zc + (top if cz > 0 else bot) * math.copysign(abs(cz) ** 0.72, cz) * min(1.0, g * 1.0)
        v = bm.verts.new((x, y, z))
        setw(v, body_weights(y))
        ring.append(v)
    verts_r.append(ring)
for a in range(len(rings) - 1):
    ra, rb = rings[a], rings[a + 1]
    last = len(G) - 1
    # inside a plate v runs front to back; the step wall between two plates and the tail samples the rear margin
    inside = rb[2] == ra[2] and rb[3] == ra[3] + 1
    sa = ra[3] / last
    sb = rb[3] / last if inside else sa
    for j in range(BODY_S):
        j2 = (j + 1) % BODY_S
        f = bm.faces.new((verts_r[a][j], verts_r[a][j2], verts_r[a + 1][j2], verts_r[a + 1][j]))
        for l, (ss, jj) in zip(f.loops, ((sa, j), (sa, j + 1), (sb, j + 1), (sb, j))):
            l[uvl].uv = uv("shell", jj / BODY_S, ss)
# close the tail tip
tip = bm.verts.new((0, rings[-1][0] + 0.012, 0.058))
setw(tip, {"abdomen": 1.0})
for j in range(BODY_S):
    j2 = (j + 1) % BODY_S
    f = bm.faces.new((verts_r[-1][j], verts_r[-1][j2], tip))
    for l in f.loops:
        l[uvl].uv = uv("shell", 0.5, 0.5)
# close the front of the body under the head
fv = bm.verts.new((0, Y0 - 0.004, 0.058))
setw(fv, {"body": 1.0})
for j in range(BODY_S):
    j2 = (j + 1) % BODY_S
    f = bm.faces.new((verts_r[0][j2], verts_r[0][j], fv))
    for l in f.loops:
        l[uvl].uv = uv("shell", 0.5, 0.0)

# ---- head: a flat domed plate
hc = Vector((0, -0.205, 0.062))
hr = (0.074, 0.066, 0.031)
sph = bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.0)
for v in sph["verts"]:
    c = v.co.copy()
    sq = 0.72 if c.z < 0 else 1.0
    v.co = Vector((c.x * hr[0] * (1 + 0.1 * c.y), c.y * hr[1], c.z * hr[2] * sq)) + hc
    setw(v, {"head": 1.0})
for f in {f for v in sph["verts"] for f in v.link_faces}:
    for l in f.loops:
        co = l.vert.co - hc
        l[uvl].uv = uv("head", 0.5 + co.x / (2 * hr[0]), 0.5 + co.y / (2 * hr[1]))

# ---- legs
leg_radii = [0.0078, 0.0070, 0.0062, 0.0052, 0.0042, 0.0032, 0.0022, 0.0012]
for i in range(N):
    for side in SIDES:
        names = leg_names(i, side)
        bones = [arm.data.bones[n] for n in names]
        sx = -1 if side == "L" else 1
        pts = [Vector((sx * 0.060, bones[0].head_local.y, 0.060)),bones[0].head_local, bones[0].tail_local, bones[1].tail_local, bones[2].tail_local]
        # up-and-out knee: lift the shin joint so the leg arches like a centipede's
        pts[2] = pts[2] + Vector((0, 0, 0.012))
        dense = []
        wts = []
        for a in range(len(pts) - 1):
            dense.append(pts[a])
            dense.append((pts[a] + pts[a + 1]) / 2)
        dense.append(pts[-1])
        jw = {0: {names[0]: 1.0}, 1: {names[0]: 1.0}, 2: {names[0]: 1.0}, 3: {names[0]: 0.5, names[1]: 0.5}, 4: {names[1]: 1.0}, 5: {names[1]: 0.5, names[2]: 0.5}, 6: {names[2]: 1.0}, 7: {names[2]: 1.0}, 8: {names[2]: 1.0}}
        tube(dense, [0.0098, 0.0090, 0.0082, 0.0072, 0.0062, 0.0052, 0.0042, 0.0030, 0.0018], lambda k, jw=jw: jw[k], "legs")

# ---- two trailing legs on the last plate (static: weighted to the abdomen)
yend = Y0 + N * P
for sx in (-1, 1):
    pts = [Vector((sx * 0.030, yend - 0.02, 0.05)), Vector((sx * 0.055, yend + 0.015, 0.045)), Vector((sx * 0.085, yend + 0.07, 0.032)), Vector((sx * 0.115, yend + 0.13, 0.020)), Vector((sx * 0.135, yend + 0.19, 0.010))]
    tube(pts, [0.0072, 0.0060, 0.0046, 0.0030, 0.0014], lambda k: {"abdomen": 1.0}, "legs")

# ---- pincers (forcipules): thick curved hooks that nearly meet at the tips
for side in SIDES:
    sx = -1 if side == "L" else 1
    # real forcipules: short, curved venom claws folded under the head, not claws held out
    base = [(0.030, -0.220, 0.040), (0.040, -0.252, 0.030), (0.038, -0.276, 0.020), (0.026, -0.292, 0.014), (0.012, -0.298, 0.011)]
    path = [Vector((sx * a, b, c)) for a, b, c in base]
    rr = [0.014, 0.0125, 0.0095, 0.0060, 0.0022]
    tube(path, rr, lambda k, s=side: {f"mandible_{s}": 1.0 if k > 0 else 0.5, "head": 0.0 if k > 0 else 0.5}, "pincer", sides=6, flatten=0.8)

# ---- antennae: long, curving, thin
for side in SIDES:
    sx = -1 if side == "L" else 1
    base = [(0.030, -0.232, 0.066), (0.036, -0.250, 0.068), (0.050, -0.285, 0.070), (0.074, -0.330, 0.068), (0.098, -0.372, 0.062), (0.120, -0.410, 0.054), (0.140, -0.440, 0.046)]
    path = [Vector((sx * a, b, c)) for a, b, c in base]
    tube(path, [0.0046, 0.0042, 0.0036, 0.0030, 0.0024, 0.0017, 0.0010], lambda k, s=side: {f"antenna_{s}": 1.0}, "ant", sides=4)

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.normal_update()
bm.to_mesh(mesh)
bm.free()
for p in mesh.polygons:
    p.use_smooth = True
obj.parent = arm
mod = obj.modifiers.new("Armature", "ARMATURE")
mod.object = arm
# believable size: the whole rig is exported at 0.6 so the animal is about 1.6 m long in game (the manifest scale stays 3 for the roach bite clip)
arm.scale = (0.6, 0.6, 0.6)

# ---------------------------------------------------------------- material (same node layout as the roach: albedo, ORM, normal)
mat = bpy.data.materials.new("Dark red-brown chitin")
mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes):
    if n.type != "OUTPUT_MATERIAL":
        nt.nodes.remove(n)
out = [n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"][0]
bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])


def img(name, path, cs):
    i = bpy.data.images.load(path)
    i.name = name
    i.colorspace_settings.name = cs
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = i
    return t


alb = img("centipede-albedo", D + "albedo.png", "sRGB")
orm = img("centipede-orm", D + "orm.png", "Non-Color")
nrm = img("centipede-normal", D + "normal.png", "Non-Color")
nt.links.new(alb.outputs["Color"], bsdf.inputs["Base Color"])
sep = nt.nodes.new("ShaderNodeSeparateColor")
nt.links.new(orm.outputs["Color"], sep.inputs["Color"])
nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
nm = nt.nodes.new("ShaderNodeNormalMap")
nm.inputs["Strength"].default_value = 1.0
nt.links.new(nrm.outputs["Color"], nm.inputs["Color"])
nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
mat.use_backface_culling = False
mesh.materials.append(mat)

print("TRIS", sum(len(p.vertices) - 2 for p in mesh.polygons), "VERTS", len(mesh.vertices), "BONES", len(arm.data.bones))
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", export_animations=True, export_animation_mode="ACTIONS",
    export_image_format="WEBP", export_image_quality=80, export_apply=False, export_yup=True,
)
print("EXPORTED", OUT)
