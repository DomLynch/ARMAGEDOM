"""Roach v3 (Blender, CPU): keep the rig, 27 joints and 6 clips; replace the body look with plated shell, ragged wing cases,
thicker spiked legs, bigger glossy eyes; re-UV onto the reference-built atlas. Run: blender -b -P build3.py -- out.glb"""
import bpy, bmesh, math, random, sys
from mathutils import Vector, Matrix, kdtree
from mathutils import noise as mnoise

OUT = sys.argv[-1]
D = "/srv/dev-jobs/art-roach/"
random.seed(2712)
bpy.ops.wm.read_factory_settings(use_empty=True)
# The source clips are 30 fps (0.6 s = 18 frames); the factory 24 fps scene trimmed the last frame off every clip.
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=D + "original-roach.glb")
for o in list(bpy.data.objects):
    if o.name.startswith("Icosphere"):
        bpy.data.objects.remove(o)
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
obj = [o for o in bpy.data.objects if o.type == "MESH"][0]
mesh = obj.data
gname = {g.index: g.name for g in obj.vertex_groups}

bm = bmesh.new()
bm.from_mesh(mesh)
uvl = bm.loops.layers.uv.active
dl = bm.verts.layers.deform.verify()


def dom(v):
    w = v[dl]
    if not w:
        return "body"
    return gname[max(w.items(), key=lambda kv: kv[1])[0]]


# --- classify old faces before touching anything
band = {}
for f in bm.faces:
    band[f] = min(3, int(f.loops[0][uvl].uv.x * 4))
bm.verts.ensure_lookup_table()
old_dom = {v: dom(v) for v in bm.verts}


def fdom(f):
    d = [old_dom[v] for v in f.verts]
    return max(set(d), key=d.count)


cat = {}
dead = []
for f in bm.faces:
    g, b = fdom(f), band[f]
    c = f.calc_center_median()
    if b == 3:
        cat[f] = "eye"
    elif g.startswith(("leg_", "shin_", "foot_")):
        cat[f] = "leg:" + g[-2:]
    elif g.startswith("antenna"):
        cat[f] = "ant"
    elif g.startswith("mandible"):
        cat[f] = "mand"
    elif b == 1 and g in ("abdomen", "body", "root") and -0.2 < c.y < 0.215:
        dead.append(f)  # abdomen ridge strips: the new wing cases replace them
    elif b == 1:
        cat[f] = "ant"  # cerci and other fine spikes
    elif g == "head":
        cat[f] = "head"
    else:
        cat[f] = "belly"
bmesh.ops.delete(bm, geom=dead, context="FACES_ONLY")
for f in dead:
    cat.pop(f, None)
loose = [v for v in bm.verts if not v.link_faces]
bmesh.ops.delete(bm, geom=loose, context="VERTS")
# one vertex per position so inflating along normals cannot tear UV or normal seams
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
bm.verts.ensure_lookup_table()
bm.normal_update()

# --- thicker legs: push along the normal
for v in bm.verts:
    fs = [cat.get(f, "") for f in v.link_faces]
    if fs and all(c.startswith("leg:") for c in fs):
        v.co += v.normal * 0.0042
for f in bm.faces:
    if cat.get(f) == "eye":
        for v in f.verts:
            v.co += v.normal * 0.0012
bm.normal_update()

# --- kd tree of the old body for skin weights of anything new
kd = kdtree.KDTree(len(bm.verts))
for i, v in enumerate(bm.verts):
    kd.insert(v.co, i)
kd.balance()
src_w = {i: {g: w for g, w in v[dl].items()} for i, v in enumerate(bm.verts)}


def copy_weights(v, from_idx):
    v[dl].clear()
    for g, w in src_w[from_idx].items():
        v[dl][g] = w


def weight_nearest(verts):
    for v in verts:
        _, i, _ = kd.find(v.co)
        copy_weights(v, i)


new_faces = {"plate": [], "spike": []}


def add_sphere(center, radii, rot=(0, 0, 0), u=24, vseg=14, keep=None, name="plate"):
    r = bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=vseg, radius=1.0)
    verts = r["verts"]
    for v in verts:
        v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
    rm = Matrix.Rotation(rot[2], 4, "Z") @ Matrix.Rotation(rot[1], 4, "Y") @ Matrix.Rotation(rot[0], 4, "X")
    for v in verts:
        v.co = rm @ v.co + Vector(center)
    faces = {f for v in verts for f in v.link_faces}
    return verts, faces


def cut_and_roughen(verts, faces, keep, ragged_y=None, amp=0.0035, seed=1, notch=0.03):
    """Drop faces failing keep(co); tear the far edge into teeth; displace along z with noise."""
    kill = []
    for f in faces:
        c = f.calc_center_median()
        if not keep(c):
            kill.append(f)
            continue
        if ragged_y is not None and (c.y - ragged_y) * (1 if ragged_y > 0 else -1) > -notch * 0.2:
            n = mnoise.noise(Vector((c.x * 55 + seed, c.y * 55, seed)))
            if n > -0.05:
                kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    left = [f for f in faces if f.is_valid]
    vs = {v for f in left for v in f.verts}
    for v in vs:
        n = mnoise.noise(Vector((v.co.x * 70 + seed * 3, v.co.y * 70, v.co.z * 70)))
        v.co.z += n * amp
    return left, vs


# pronotum: domed plate over the thorax with a thick rim
vs, fs = add_sphere((0, -0.098, 0.066), (0.112, 0.078, 0.040), u=28, vseg=16)
fs_l, vs_l = cut_and_roughen(vs, fs, keep=lambda c: c.z > 0.052, amp=0.0022, seed=3)
for f in fs_l:
    cat[f] = "shell"
weight_nearest(vs_l)

# two wing cases, diverging, outer edge lower, torn tips
for side in (-1, 1):
    vs, fs = add_sphere((side * 0.05, 0.085, 0.074), (0.064, 0.158, 0.027), rot=(0, side * -0.12, side * -0.025), u=26, vseg=16)
    fs_l, vs_l = cut_and_roughen(vs, fs, keep=lambda c: c.z > 0.062 and c.y > -0.075, ragged_y=0.17, amp=0.003, seed=5 + side, notch=0.05)
    for f in fs_l:
        cat[f] = "shell"
    weight_nearest(vs_l)

# a raised torn flap (third wing) lifting on the left rear
vs, fs = add_sphere((-0.062, 0.16, 0.112), (0.05, 0.085, 0.006), rot=(0.0, -0.45, 0.12), u=16, vseg=10)
fs_l, vs_l = cut_and_roughen(vs, fs, keep=lambda c: True, ragged_y=0.215, amp=0.004, seed=11, notch=0.05)
for f in fs_l:
    cat[f] = "shell"
weight_nearest(vs_l)


def add_cone(base, direction, length, radius, sides=5):
    d = direction.normalized()
    t = d.cross(Vector((0, 0, 1)))
    if t.length < 1e-3:
        t = d.cross(Vector((1, 0, 0)))
    t.normalize()
    b = d.cross(t)
    ring = []
    for k in range(sides):
        a = 2 * math.pi * k / sides
        ring.append(bm.verts.new(base + t * math.cos(a) * radius + b * math.sin(a) * radius))
    tip = bm.verts.new(base + d * length)
    fs = []
    for k in range(sides):
        fs.append(bm.faces.new((ring[k], ring[(k + 1) % sides], tip)))
    return ring + [tip], fs


# spikes: along the legs (up and outward), brow and rim
random.seed(2713)
leg_ids = sorted({c[4:] for c in cat.values() if c.startswith("leg:")})
spike_specs = []
for lid in leg_ids:
    vs_ = sorted({v for f in bm.faces if cat.get(f) == "leg:" + lid for v in f.verts}, key=lambda v: v.co.x * (1 if lid.endswith("R") else -1))
    if not vs_:
        continue
    root = min(vs_, key=lambda v: abs(v.co.x))
    far = max(vs_, key=lambda v: (v.co - root.co).length)
    span = (far.co - root.co).length
    picks = []
    for v in vs_:
        t = (v.co - root.co).length / span
        if 0.18 < t < 0.97 and (v.normal.z > 0.15 or abs(v.normal.x) > 0.6):
            picks.append((t, v))
    random.shuffle(picks)
    chosen = []
    for t, v in picks:
        if all((v.co - c.co).length > 0.016 for _, c in chosen):
            chosen.append((t, v))
        if len(chosen) >= 13:
            break
    for t, v in chosen:
        spike_specs.append((v, 0.05 * (1.05 - 0.55 * t), 0.0058 * (1.1 - 0.5 * t)))
for v, ln, rd in spike_specs:
    n = (v.normal * 1.0 + Vector((0, 0.35, 0.25))).normalized()
    verts_, fs_ = add_cone(v.co - v.normal * 0.002, n, ln, rd)
    for nv in verts_:
        copy_weights(nv, kd.find(v.co)[1])
    for f in fs_:
        cat[f] = "spike"
# brow and shell-rim spikes
for x in (-1, 1):
    for y, z, ln in ((-0.205, 0.062, 0.03), (-0.16, 0.072, 0.026)):
        b = Vector((x * 0.04, y, z))
        verts_, fs_ = add_cone(b, Vector((x * 0.5, -0.5, 0.8)), ln, 0.005)
        for nv in verts_:
            copy_weights(nv, kd.find(b)[1])
        for f in fs_:
            cat[f] = "spike"
for i in range(8):
    x = (i - 3.5) * 0.026
    for y0 in (0.205,):
        b = Vector((x, y0 + 0.01 * abs(i - 3.5) / 3.5 * -1, 0.06))
        verts_, fs_ = add_cone(b, Vector((x * 4, 1.0, 0.25)), 0.022, 0.0045)
        for nv in verts_:
            copy_weights(nv, kd.find(b)[1])
        for f in fs_:
            cat[f] = "spike"

# mandible drips: thin wet teardrop cones under the mouth
for x in (-0.018, 0.018, 0.0):
    b = Vector((x, -0.24, 0.032))
    verts_, fs_ = add_cone(b, Vector((0, -0.1, -1)), random.uniform(0.022, 0.034), 0.0028)
    for nv in verts_:
        copy_weights(nv, kd.find(b)[1])
    for f in fs_:
        cat[f] = "spike"

# --- UVs
bm.faces.ensure_lookup_table()
# antenna parameter: distance from the head attach point
head_pt = Vector((0, -0.2, 0.05))
ant_max = max([(v.co - head_pt).length for f in bm.faces if cat.get(f) == "ant" for v in f.verts] or [1])
leg_info = {}
for lid in leg_ids:
    vs_ = [v for f in bm.faces if cat.get(f) == "leg:" + lid for v in f.verts]
    root = min(vs_, key=lambda v: abs(v.co.x))
    far = max(vs_, key=lambda v: (v.co - root.co).length)
    leg_info[lid] = (root.co.copy(), (far.co - root.co).length)

BELLY0, SHELL0 = (0.52, 0.52), (0.02, 0.52)


def box_uv(co, n, org, rx, ry, rz):
    ax = max(range(3), key=lambda k: abs(n[k]))
    if ax == 2:
        a, b = co.x / rx, co.y / ry
    elif ax == 1:
        a, b = co.x / rx, co.z / rz
    else:
        a, b = co.y / ry, co.z / rz
    return org[0] + 0.46 * (0.5 + 0.5 * max(-1, min(1, a))), org[1] + 0.46 * (0.5 + 0.5 * max(-1, min(1, b)))


for f in bm.faces:
    c = cat.get(f, "belly")
    n = f.normal
    for l in f.loops:
        co = l.vert.co
        if c == "shell":
            u = SHELL0[0] + 0.46 * min(1, max(0, (co.x + 0.16) / 0.32))
            v = SHELL0[1] + 0.46 * min(1, max(0, (co.y + 0.18) / 0.45))
        elif c == "belly":
            u, v = box_uv(co, n, BELLY0, 0.12, 0.26, 0.12)
        elif c == "head":
            u, v = box_uv(co, n, (0.5, 0.0), 0.12, 0.26, 0.12)
            u = 0.5 + (u - 0.5) * 0.46
        elif c == "mand":
            u = 0.5 + 0.22 * ((co.x + 0.05) / 0.1)
            v = 0.05 + 0.4 * min(1, max(0, (co.y + 0.27) / 0.1))
        elif c == "ant":
            t = min(1, (co.copy() - head_pt).length / ant_max)
            u, v = 0.80, 0.02 + 0.46 * t
        elif c == "eye":
            u, v = 0.95, 0.1
        elif c == "spike":
            u, v = 0.12, 0.25
        elif c.startswith("leg:"):
            root, span = leg_info[c[4:]]
            t = min(1, (co - root).length / span)
            nn = l.vert.normal
            u = 0.04 + 0.42 * (0.5 + 0.5 * nn.z)
            v = 0.04 + 0.42 * t
        else:
            u, v = 0.5, 0.25
        l[uvl].uv = (u, v)

bm.normal_update()
bm.to_mesh(mesh)
bm.free()
for p in mesh.polygons:
    p.use_smooth = True
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
try:
    bpy.ops.mesh.customdata_custom_splitnormals_clear()
except Exception as e:
    print("splitnormals", e)

# --- material (name is guarded by roach-appearance.js)
mat = obj.data.materials[0]
mat.name = "Worn rust-brown chitin"
mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes):
    if n.type not in ("OUTPUT_MATERIAL",):
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


alb = img("roach-albedo", D + "albedo.png", "sRGB")
orm = img("roach-orm", D + "orm.png", "Non-Color")
nrm = img("roach-normal", D + "normal.png", "Non-Color")
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

print("TRIS", sum(len(p.vertices) - 2 for p in mesh.polygons), "VERTS", len(mesh.vertices))
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", export_animations=True, export_animation_mode="ACTIONS",
    export_image_format="WEBP", export_image_quality=80, export_apply=False, export_yup=True,
)
print("EXPORTED", OUT)
