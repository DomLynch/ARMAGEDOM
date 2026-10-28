"""Crow (Blender 5.2 headless, CPU): keep the rat rig (24 bones, 7 clips, scene graph, mesh and material guards), replace the mesh with a
big ragged carrion crow. Run: blender -b -P build_crow.py -- out.glb   (cwd holds original-rat.glb, albedo.png, orm.png, normal.png)

Body plan on the rat bones: hind legs -> crow legs and feet, front legs -> half-open wings (the walk swing becomes a wing flick),
tail chain -> tail feathers, head/jaw/bite_tip -> skull and beak. Every vertex gets weights from its position along those bones
(no new bones, no re-parenting). Primitive order and the mesh name match the rat so the shared bite sweep (tooth vertex 80 of the
fourth primitive) lands on the beak.
"""
import bpy, bmesh, math, random, sys
from mathutils import Vector, Matrix

OUT = sys.argv[-1]
D = "./"
random.seed(2810)
bpy.ops.wm.read_factory_settings(use_empty=True)
# The rat clips are 30 fps (0.6 s = 18 frames); the factory 24 fps scene would trim the last frame off every clip.
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=D + "original-rat.glb")
for o in list(bpy.data.objects):
    if o.name.startswith("Icosphere"):
        bpy.data.objects.remove(o)
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
obj = [o for o in bpy.data.objects if o.type == "MESH"][0]
mesh = obj.data
gidx = {g.name: g.index for g in obj.vertex_groups}
group_names = [g.name for g in sorted(obj.vertex_groups, key=lambda g: g.index)]
mesh.clear_geometry()
mesh.materials.clear()
if not obj.vertex_groups:  # clear_geometry drops the groups; same names and order
    for n in group_names:
        obj.vertex_groups.new(name=n)

bm = bmesh.new()
dl = bm.verts.layers.deform.verify()
uvl = bm.loops.layers.uv.new("UVMap")
W = {}  # vert -> {bone: weight}
TAG = {}  # face -> (material index, uv kind, uv params)
FEATHER, LEG, EYE, BEAK = 0, 1, 2, 3


# ---------- weights
def tent(y, centres):
    """Piecewise-linear partition of unity along y over [(y, bone), ...] sorted by y descending (rear to front)."""
    if y >= centres[0][0]:
        return {centres[0][1]: 1.0}
    if y <= centres[-1][0]:
        return {centres[-1][1]: 1.0}
    for (y0, b0), (y1, b1) in zip(centres, centres[1:]):
        if y1 <= y <= y0:
            t = (y0 - y) / (y0 - y1)
            return {b0: 1 - t, b1: t}
    return {centres[-1][1]: 1.0}


SPINE = [(0.09, "pelvis"), (0.035, "spine"), (-0.02, "chest"), (-0.075, "neck")]


def body_w(co):
    return tent(co.y, SPINE)


def head_w(co):
    return {"head": 0.88, "neck": 0.12} if co.y > -0.125 else {"head": 1.0}


def tail_chain(y):
    pts = [(0.30, "tail_3"), (0.22, "tail_2"), (0.15, "tail_1"), (0.09, "pelvis")]
    return tent(y, pts)


def wing_w(co, side):
    s = "L" if side < 0 else "R"
    out = abs(co.x) - 0.05  # metres outboard of the shoulder
    a = max(0.0, min(1.0, out / 0.14))
    return {"chest": 0.7 * (1 - a) + 0.05, "leg_F" + s: 0.3 + 0.55 * a - 0.0, "shin_F" + s: 0.0 + 0.1 * a}


def leg_w(co, side):
    s = "L" if side < 0 else "R"
    z = co.z
    if z > 0.07:
        return {"leg_B" + s: 1.0}
    if z > 0.045:
        t = (0.07 - z) / 0.025
        return {"leg_B" + s: 1 - t, "shin_B" + s: t}
    if z > 0.025:
        t = (0.045 - z) / 0.02
        return {"shin_B" + s: 1 - t, "paw_B" + s: t}
    return {"paw_B" + s: 1.0}


def put(v, w):
    tot = sum(w.values()) or 1.0
    items = sorted(w.items(), key=lambda kv: -kv[1])[:4]
    tot = sum(x for _, x in items)
    W[v] = {k: x / tot for k, x in items if x > 1e-4}


# ---------- primitives
def finish_faces(faces, tag):
    for f in faces:
        TAG[f] = tag


def tube(points, radii, sides=7, cap0=True, cap1=True, wfn=None, tag=(FEATHER, "box", None), up=Vector((0, 0, 1))):
    """Elliptical sweep. points: centres; radii: (rx, rz) per point (rx along the side axis, rz along the up axis)."""
    rings = []
    n = len(points)
    for i, p in enumerate(points):
        t = (points[min(i + 1, n - 1)] - points[max(i - 1, 0)]).normalized()
        side = t.cross(up)
        if side.length < 1e-3:
            side = t.cross(Vector((1, 0, 0)))
        side.normalize()
        u = side.cross(t).normalized()
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            v = bm.verts.new(p + side * math.cos(a) * radii[i][0] + u * math.sin(a) * radii[i][1])
            ring.append(v)
        rings.append(ring)
    faces = []
    for i in range(n - 1):
        for k in range(sides):
            faces.append(bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k])))
    allv = [v for r in rings for v in r]
    if cap0:
        c = bm.verts.new(points[0] - (points[1] - points[0]).normalized() * 0.0)
        for k in range(sides):
            faces.append(bm.faces.new((c, rings[0][(k + 1) % sides], rings[0][k])))
        allv.append(c)
    if cap1:
        c = bm.verts.new(points[-1])
        for k in range(sides):
            faces.append(bm.faces.new((c, rings[-1][k], rings[-1][(k + 1) % sides])))
        allv.append(c)
    if wfn:
        for v in allv:
            put(v, wfn(v.co))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    finish_faces(faces, tag)
    return allv, faces


def blob(center, radii, segs=(18, 11), wfn=None, tag=(FEATHER, "box", None), shape=None, rot=0.0):
    r = bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=1.0)
    verts = r["verts"]
    for v in verts:
        c = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
        if shape:
            c = shape(c)
        if rot:
            c = Matrix.Rotation(rot, 3, "X") @ c
        v.co = c + Vector(center)
        if wfn:
            put(v, wfn(v.co))
    faces = list({f for v in verts for f in v.link_faces})
    finish_faces(faces, tag)
    return verts, faces


def feather(base, direction, length, width, wfn, curl=0.0, segs=4, tip="point", lift=Vector((0, 0, 1)), jag=0.0, hint=Vector((0, 0, 1))):
    """A flat vane strip: from base along direction, drooping by curl (radians over its length), width tapering to a point or a split tip."""
    d = direction.normalized()
    side = d.cross(lift)
    if side.length < 1e-3:
        side = d.cross(Vector((1, 0, 0)))
    side.normalize()
    pos = base.copy()
    cur = d.copy()
    left, right = [], []
    step = length / segs
    for i in range(segs + 1):
        t = i / segs
        w = width * (math.sin(math.pi * min(1.0, 0.18 + 0.82 * t) * 0.5 + 0.0) if tip == "point" else (1 - 0.35 * t))
        w *= 1 - 0.55 * t * t
        j = (random.random() - 0.5) * jag * t
        left.append(bm.verts.new(pos - side * (w + j)))
        right.append(bm.verts.new(pos + side * (w - j)))
        pos = pos + cur * step
        cur = (cur + Vector((0, 0, -1)) * (curl / segs)).normalized()
    faces = []
    for i in range(segs):
        faces.append(bm.faces.new((left[i], right[i], right[i + 1], left[i + 1])))
    # the tip closes to one point
    tipv = bm.verts.new(pos)
    extra = []
    if tip == "split" and random.random() < 0.7:
        tipv.co += side * width * 0.5
        tip2 = bm.verts.new(pos - side * width * 0.5 - d * length * 0.12)
        extra.append(tip2)
        faces.append(bm.faces.new((left[-1], right[-1], tipv)))
        faces.append(bm.faces.new((left[-1], tipv, tip2)))
    else:
        faces.append(bm.faces.new((left[-1], right[-1], tipv)))
    vs = left + right + [tipv] + extra
    for f in faces:
        if f.normal.dot(hint) < 0:
            f.normal_flip()
    # u across the vane, v along it
    for f in faces:
        TAG[f] = (FEATHER, "blade", (base, d, side, length, width))
    for v in vs:
        put(v, wfn(v.co))
    return vs, faces


def hind_leg(side):
    s = side
    hip = Vector((s * 0.048, 0.062, 0.078))
    knee = Vector((s * 0.052, 0.058, 0.052))
    ankle = Vector((s * 0.063, 0.05, 0.016))
    fw = lambda co: leg_w(co, s)
    # feathered thigh ("trousers") in the plumage material
    blob((s * 0.047, 0.062, 0.078), (0.026, 0.04, 0.034), segs=(12, 8), wfn=lambda co: {"leg_B" + ("L" if s < 0 else "R"): 1.0})
    # tarsus
    tube([hip + Vector((0, 0, -0.01)), knee, ankle], [(0.0095, 0.0095), (0.0085, 0.0085), (0.0075, 0.0075)], sides=6, wfn=fw, tag=(LEG, "flat", None))
    # toes: three forward, one back, claws curling down
    for ang, ln in ((-0.5, 0.036), (0.0, 0.048), (0.5, 0.036), (math.pi, 0.026)):
        dirv = Vector((math.sin(ang) * 0.9, -math.cos(ang), 0)).normalized()
        base = ankle + Vector((0, 0, -0.004))
        pts = [base, base + dirv * ln * 0.5 + Vector((0, 0, -0.003)), base + dirv * ln + Vector((0, 0, -0.005)), base + dirv * (ln + 0.014) + Vector((0, 0, -0.011))]
        tube(pts, [(0.0072, 0.0058), (0.0058, 0.0048), (0.0042, 0.0038), (0.0016, 0.0016)], sides=5, cap0=False, wfn=fw, tag=(LEG, "flat", None))


# ---------- body
def tapered(c):
    """Crow body: full chest, tapering rump, a slight hump."""
    t = max(0.0, c.y / 0.112)
    k = 1 - 0.42 * t * t
    return Vector((c.x * k, c.y, c.z * k + 0.004 * (1 - abs(c.y) / 0.112)))


blob((0, 0.012, 0.104), (0.058, 0.114, 0.058), segs=(22, 13), wfn=body_w, shape=tapered)
blob((0, -0.072, 0.118), (0.052, 0.07, 0.056), segs=(18, 11), wfn=body_w)
tube([Vector((0, -0.09, 0.128)), Vector((0, -0.112, 0.142)), Vector((0, -0.128, 0.148))], [(0.04, 0.036), (0.032, 0.03), (0.027, 0.026)], sides=9, cap0=False, cap1=False, wfn=lambda co: {"neck": 0.6, "head": 0.4} if co.y < -0.115 else {"chest": 0.35, "neck": 0.65})
blob((0, -0.138, 0.148), (0.031, 0.041, 0.031), segs=(16, 10), wfn=head_w)

# beak: heavy upper bill with a hooked tip, thinner lower bill on the jaw
up_pts = [Vector((0, -0.16, 0.146)), Vector((0, -0.19, 0.142)), Vector((0, -0.222, 0.133)), Vector((0, -0.248, 0.117))]
up_rad = [(0.019, 0.017), (0.0155, 0.0145), (0.009, 0.01), (0.0022, 0.0022)]
def resample(pts, rad, per=2):
    """Insert `per` extra rings between each pair so the bill has enough vertices to carry the shared bite vertex index."""
    P, R = [], []
    for i in range(len(pts) - 1):
        for k in range(per + 1):
            t = k / (per + 1)
            P.append(pts[i].lerp(pts[i + 1], t))
            R.append((rad[i][0] + (rad[i + 1][0] - rad[i][0]) * t, rad[i][1] + (rad[i + 1][1] - rad[i][1]) * t))
    P.append(pts[-1])
    R.append(rad[-1])
    return P, R


up_pts, up_rad = resample(up_pts, up_rad, 1)
tube(up_pts, up_rad, sides=8, cap0=False, wfn=lambda co: {"head": 1.0}, tag=(BEAK, "flat", None))
lo_pts = [Vector((0, -0.162, 0.126)), Vector((0, -0.19, 0.122)), Vector((0, -0.222, 0.116)), Vector((0, -0.24, 0.11))]
lo_rad = [(0.0135, 0.0095), (0.0105, 0.0078), (0.006, 0.0055), (0.0018, 0.0018)]
lo_pts, lo_rad = resample(lo_pts, lo_rad, 1)
tube(lo_pts, lo_rad, sides=8, cap0=False, wfn=lambda co: {"jaw": 0.7, "bite_tip": 0.3} if co.y < -0.19 else {"jaw": 1.0}, tag=(BEAK, "flat", None))

# glowing pale eyes
for s in (-1, 1):
    blob((s * 0.0268, -0.149, 0.1545), (0.0072, 0.0072, 0.0072), segs=(10, 7), wfn=lambda co: {"head": 1.0}, tag=(EYE, "flat", None))

hind_leg(-1)
hind_leg(1)


# ---------- feathers
def wing(side):
    s = side
    sh = Vector((s * 0.052, -0.03, 0.136))  # shoulder
    wr = Vector((s * 0.108, 0.0, 0.112))  # wrist: half open, dropped
    tp = Vector((s * 0.158, 0.056, 0.06))  # hand tip
    fw = lambda co: wing_w(co, s)
    arm = lambda t: sh.lerp(wr, t / 0.5) if t < 0.5 else wr.lerp(tp, (t - 0.5) / 0.5)
    back = Vector((s * 0.12, 1.0, -0.22)).normalized()
    # flight feathers: secondaries from the arm, primaries fanning from the hand
    for i in range(15):
        t = 0.08 + 0.9 * i / 14
        base = arm(t)
        fan = back.lerp(Vector((s * 0.55, 0.72, -0.42)).normalized(), max(0.0, (t - 0.45) / 0.55))
        fan = Vector((fan.x + (random.random() - 0.5) * 0.18, fan.y, fan.z + (random.random() - 0.5) * 0.12))
        ln = (0.075 + 0.07 * min(1.0, t * 1.5)) * (0.55 if random.random() < 0.18 else random.uniform(0.85, 1.05))  # a few broken quills
        feather(base, fan, ln, 0.0175, fw, curl=0.5, segs=4, tip="split", jag=0.008)
    # coverts: shorter, overlapping, a little above
    for row, (back_off, scale) in enumerate(((0.018, 0.55), (0.034, 0.34))):
        for i in range(12):
            t = 0.04 + 0.88 * i / 11
            base = arm(t) + Vector((0, -0.004, 0.004 + 0.003 * row))
            fan = back.lerp(Vector((s * 0.5, 0.75, -0.4)).normalized(), max(0.0, (t - 0.45) / 0.55))
            fan = Vector((fan.x + (random.random() - 0.5) * 0.2, fan.y, fan.z))
            feather(base, fan, (0.075 + 0.04 * t) * scale + back_off, 0.021, fw, curl=0.35, segs=3, tip="point")


wing(-1)
wing(1)

# tail: a ragged fan that trails low
for i in range(9):
    a = (i - 4) * 0.115
    dirv = Vector((math.sin(a), math.cos(a), -0.2 - 0.02 * abs(i - 4)))
    ln = random.uniform(0.15, 0.19) * (0.7 if i in (2, 6) else 1.0)
    base = Vector((a * 0.02, 0.084, 0.108 - 0.003 * abs(i - 4)))
    feather(base, dirv, ln, 0.024, lambda co: tail_chain(co.y), curl=0.25, segs=5, tip="split", jag=0.01)

# ruffled hackles around the neck and shoulders, raised and swept back
for i in range(16):
    ang = 2 * math.pi * i / 16
    yy = random.uniform(-0.115, -0.05)
    base = Vector((math.cos(ang) * 0.034 * (1.1 if yy > -0.1 else 1.5), yy, 0.135 + math.sin(ang) * 0.034))
    nrm = (base - Vector((0, yy, 0.135))).normalized()
    dirv = (nrm * 0.45 + Vector((0, 1, 0)) * 1.0).normalized()
    feather(base, dirv, random.uniform(0.03, 0.044), 0.013, lambda co: tent(co.y, SPINE), curl=0.1, segs=2, tip="point", lift=nrm, hint=nrm)

# crown tufts
for sx in (-0.012, 0.0, 0.012):
    feather(Vector((sx, -0.135, 0.176)), Vector((sx * 6, 0.75, 0.55)), 0.034, 0.0105, lambda co: {"head": 1.0}, curl=0.1, segs=2, tip="point")

# ---------- UVs
bm.faces.ensure_lookup_table()
TILE_M = 0.48
for f in bm.faces:
    mat, kind, prm = TAG.get(f, (FEATHER, "box", None))
    f.material_index = mat
    n = f.normal
    for l in f.loops:
        co = l.vert.co
        if kind == "blade":
            base, d, side, length, width = prm
            t = max(0.0, min(1.0, (co - base).dot(d) / length))
            lat = max(-1.0, min(1.0, (co - base).dot(side) / (width * 1.4)))
            u = 0.5 + 0.5 * (0.02 + 0.96 * (0.5 + 0.5 * lat))
            v = 0.02 + 0.96 * t
        elif kind == "box":
            # one isotropic scale on every projection: the plumage tile (512 px, u 0 to .5, v 0 to 1) spans 0.48 m of body
            ax = max(range(3), key=lambda k: abs(n[k]))
            if ax == 2:
                a, b = co.x, co.y
            elif ax == 1:
                a, b = co.x, co.z - 0.1
            else:
                a, b = co.y, co.z - 0.1
            u = 0.25 + 0.46 * a / TILE_M
            v = 0.5 + 0.96 * b / TILE_M
        else:
            u, v = 0.25, 0.5
        l[uvl].uv = (u, v)

# ---------- weights to the deform layer
for v, w in W.items():
    for b, x in w.items():
        v[dl][gidx[b]] = x
unweighted = [v for v in bm.verts if not v[dl]]
print("UNWEIGHTED", len(unweighted))
print("BEAKVERTS", len({v for f in bm.faces if TAG.get(f, (0,))[0] == BEAK for v in f.verts}))

# the beak primitive must keep vertex 80 on the bill (the bite sweep reads it): merge nothing, keep creation order
bm.normal_update()
bm.to_mesh(mesh)
bm.free()
for p in mesh.polygons:
    p.use_smooth = True


# ---------- materials (index order matches the rat: coat, skin, eyes, teeth)
def mk(name, base, rough, metal, textured=False, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    out = [n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"][0]
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    b.inputs["Base Color"].default_value = base
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = emit
        b.inputs["Emission Strength"].default_value = 1.0
    if textured:
        def img(nm, path, cs):
            i = bpy.data.images.load(D + path)
            i.name = nm
            i.colorspace_settings.name = cs
            t = nt.nodes.new("ShaderNodeTexImage")
            t.image = i
            return t
        alb = img("crow-albedo", "albedo.png", "sRGB")
        orm = img("crow-orm", "orm.png", "Non-Color")
        nrm = img("crow-normal", "normal.png", "Non-Color")
        nt.links.new(alb.outputs["Color"], b.inputs["Base Color"])
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(orm.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], b.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], b.inputs["Metallic"])
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = 1.0
        nt.links.new(nrm.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    m.use_backface_culling = False
    return m


mesh.materials.append(mk("Glossy black carrion feathers", (0.04, 0.035, 0.04, 1), 0.4, 0.15, textured=True))
mesh.materials.append(mk("Scaled ash-grey legs and feet", (0.055, 0.045, 0.04, 1), 0.7, 0.0))
mesh.materials.append(mk("Pale glowing eyes", (0.9, 0.93, 0.78, 1), 0.3, 0.0, emit=(0.86, 0.95, 0.72, 1)))
mesh.materials.append(mk("Dark horn beak", (0.045, 0.038, 0.034, 1), 0.3, 0.0))
mesh.name = "Original ARM rat surface"

print("DBG", obj.name, obj.parent and obj.parent.name, [(m.type, m.object and m.object.name, m.show_viewport) for m in obj.modifiers], len(obj.vertex_groups), len(mesh.vertices))
print("TRIS", sum(len(p.vertices) - 2 for p in mesh.polygons), "VERTS", len(mesh.vertices))
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", export_animations=True, export_animation_mode="ACTIONS",
    export_image_format="WEBP", export_image_quality=80, export_apply=False, export_yup=True,
)
print("EXPORTED", OUT)
