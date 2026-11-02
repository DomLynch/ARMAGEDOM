"""Spider (Blender, CPU): keep the roach rig (27 joints, six clips, same bind pose) and replace the mesh with a large hairy eight-legged spider.
Four leg pairs ride the roach's three leg chains: the front pair on leg_0, the second and third pairs on leg_1, the rear pair on leg_2
(so two legs are added with no new bones and no new clips). Body parts copy skin weights from the nearest original vertex.
Run: blender -b -P build.py -- out.glb   (needs original-roach.glb, albedo.png, orm.png, normal.png next to it, D below)"""
import bpy, bmesh, math, random, sys
from mathutils import Vector, kdtree

OUT = sys.argv[-1]
D = "/srv/dev-jobs/spider/"
random.seed(2828)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30  # the source clips are 30 fps; a 24 fps scene trims the last frame off every clip
bpy.ops.import_scene.gltf(filepath=D + "original-roach.glb")
for o in list(bpy.data.objects):
    if o.name.startswith("Icosphere"):
        bpy.data.objects.remove(o)
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
obj = [o for o in bpy.data.objects if o.type == "MESH"][0]
old = obj.data
gname = {g.index: g.name for g in obj.vertex_groups}
gidx = {g.name: g.index for g in obj.vertex_groups}
mat = old.materials[0]

# kd tree of the original body with its skin weights
kd = kdtree.KDTree(len(old.vertices))
src_w = {}
for v in old.vertices:
    kd.insert(v.co, v.index)
    src_w[v.index] = {gname[g.group]: g.weight for g in v.groups}
kd.balance()

bm = bmesh.new()
uvl = bm.loops.layers.uv.verify()
dl = bm.verts.layers.deform.verify()
W = {}  # vert -> {group name: weight}


def setw(v, w):
    tot = sum(w.values()) or 1.0
    W[v] = {k: x / tot for k, x in w.items()}
    v[dl].clear()
    for k, x in W[v].items():
        v[dl][gidx[k]] = x


def near_w(v):
    return dict(src_w[kd.find(v.co)[1]])


def sm(a, lo, hi):
    t = max(0.0, min(1.0, (a - lo) / (hi - lo)))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- UV helpers (atlas quadrants, see atlas.py)
def planar(co, quadrant, x0, xr, y0, yr):
    xn = max(0.0, min(1.0, (co.x - x0) / xr))
    sn = max(0.0, min(1.0, (co.y - y0) / yr))
    return quadrant[0] + 0.01 + 0.48 * xn, quadrant[1] + 0.01 + 0.48 * sn


ABD_Q, CEPH_Q = (0.0, 0.5), (0.5, 0.5)
ABD_BOX = (-0.12, 0.24, 0.0, 0.33)  # x0, xr, y0, yr
CEPH_BOX = (-0.09, 0.18, -0.22, 0.28)


def ellipsoid(center, radii, u, v, quad, box, cat):
    r = bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    vs = r["verts"]
    for p in vs:
        p.co = Vector((p.co.x * radii[0], p.co.y * radii[1], p.co.z * radii[2])) + Vector(center)
    fs = list({f for p in vs for f in p.link_faces})
    for p in vs:
        setw(p, near_w(p))
    for f in fs:
        for l in f.loops:
            l[uvl].uv = planar(l.vert.co, quad, *box)
    return vs, fs


# ---------------------------------------------------------------- body
ceph_c, ceph_r = (0.0, -0.095, 0.074), (0.088, 0.128, 0.056)
abd_c, abd_r = (0.0, 0.165, 0.098), (0.118, 0.158, 0.098)
ceph_vs, _ = ellipsoid(ceph_c, ceph_r, 22, 14, CEPH_Q, CEPH_BOX, "ceph")
abd_vs, _ = ellipsoid(abd_c, abd_r, 26, 16, ABD_Q, ABD_BOX, "abd")
# abdomen weights: the abdomen bone wins from the front of the abdomen back; the front blends into the body bone
for p in abd_vs:
    a = sm(p.co.y, 0.0, 0.1)
    setw(p, {"abdomen": 0.75 * a + 0.25, "body": 1.0 - (0.75 * a + 0.25)})
for p in ceph_vs:
    w = near_w(p)
    if p.co.y < -0.17:
        setw(p, {"head": 0.6, "thorax": 0.4})
    else:
        setw(p, w)


def surface_point(c, r, d):
    d = Vector(d).normalized()
    k = math.sqrt((d.x / r[0]) ** 2 + (d.y / r[1]) ** 2 + (d.z / r[2]) ** 2)
    return Vector(c) + d / k


# ---------------------------------------------------------------- generic tube
def frame(tangent):
    ref = Vector((0, 0, 1)) if abs(tangent.z) < 0.9 else Vector((1, 0, 0))
    n = tangent.cross(ref).normalized()
    b = tangent.cross(n).normalized()
    return n, b


def catmull(pts, n):
    out = []
    P = [pts[0]] + list(pts) + [pts[-1]]
    segs = len(pts) - 1
    for i in range(n):
        u = i / (n - 1) * segs
        k = min(int(u), segs - 1)
        t = u - k
        p0, p1, p2, p3 = P[k], P[k + 1], P[k + 2], P[k + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out


def tube(points, radii_fn, sides, weight_fn, uv_fn, rings=14, cap=True):
    """points: control points; returns (ring vertex lists, faces). radii_fn(t), weight_fn(co, t), uv_fn(t, k_over_sides) -> (u, v)"""
    path = catmull(points, rings)
    ring_verts, faces = [], []
    for i, p in enumerate(path):
        t = i / (rings - 1)
        tan = (path[min(i + 1, rings - 1)] - path[max(i - 1, 0)]).normalized()
        n, b = frame(tan)
        r = radii_fn(t)
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            v = bm.verts.new(p + (n * math.cos(a) + b * math.sin(a)) * r)
            setw(v, weight_fn(v.co, t))
            ring.append(v)
        ring_verts.append(ring)
    for i in range(rings - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            f = bm.faces.new((ring_verts[i][k], ring_verts[i][k2], ring_verts[i + 1][k2], ring_verts[i + 1][k]))
            # loop order follows the vertex order above: (ring i, col k), (i, k+1), (i+1, k+1), (i+1, k)
            for l, (ri, ci) in zip(f.loops, ((i, k), (i, k + 1), (i + 1, k + 1), (i + 1, k))):
                l[uvl].uv = uv_fn(ri / (rings - 1), ci / sides)
            faces.append(f)
    if cap:
        tip = bm.verts.new(path[-1] + (path[-1] - path[-2]).normalized() * radii_fn(1.0) * 0.8)
        setw(tip, weight_fn(tip.co, 1.0))
        for k in range(sides):
            f = bm.faces.new((ring_verts[-1][k], ring_verts[-1][(k + 1) % sides], tip))
            for l in f.loops:
                l[uvl].uv = uv_fn(1.0, 0.5)
            faces.append(f)
    return ring_verts, faces


def add_cone(base, direction, length, radius, wsrc, uv_root, uv_tip, sides=4):
    d = direction.normalized()
    t = d.cross(Vector((0, 0, 1)))
    if t.length < 1e-3:
        t = d.cross(Vector((1, 0, 0)))
    t.normalize()
    b = d.cross(t)
    ring = [bm.verts.new(base + t * math.cos(2 * math.pi * k / sides) * radius + b * math.sin(2 * math.pi * k / sides) * radius) for k in range(sides)]
    tip = bm.verts.new(base + d * length)
    for v in ring + [tip]:
        setw(v, wsrc)
    for k in range(sides):
        f = bm.faces.new((ring[k], ring[(k + 1) % sides], tip))
        f.loops[0][uvl].uv = uv_root
        f.loops[1][uvl].uv = uv_root
        f.loops[2][uvl].uv = uv_tip


# ---------------------------------------------------------------- legs: four pairs on the roach's three chains
CHAIN = [0, 1, 1, 2]  # front pair on leg_0, middle pairs on leg_1, rear pair on leg_2
YI = [-0.125, -0.055, 0.015, 0.085]
KY = [-0.06, -0.02, 0.03, 0.07]
MY = [-0.10, -0.05, 0.06, 0.12]
FY = [-0.15, -0.075, 0.08, 0.175]
REACH = [0.99, 0.9, 0.88, 1.0]


def leg_weights(chain, side):
    nm = "L" if side < 0 else "R"

    def fn(co, t):
        ax = abs(co.x)
        to_shin = sm(ax, 0.145, 0.185)
        to_foot = sm(ax, 0.235, 0.275)
        return {f"leg_{chain}{nm}": 1 - to_shin, f"shin_{chain}{nm}": to_shin * (1 - to_foot), f"foot_{chain}{nm}": to_foot}

    return fn


def leg_radius(t):
    pts = ((0.0, 0.026), (0.15, 0.0225), (0.34, 0.018), (0.6, 0.013), (1.0, 0.0055))
    for (t0, r0), (t1, r1) in zip(pts, pts[1:]):
        if t <= t1:
            return r0 + (r1 - r0) * (t - t0) / (t1 - t0)
    return pts[-1][1]


leg_verts = []  # (vert, side, normal-ish info) for bristles
for side in (-1, 1):
    for i in range(4):
        r = REACH[i]
        pts = [
            Vector((side * 0.062, YI[i], 0.072)),
            Vector((side * 0.19 * r, YI[i] + KY[i], 0.178)),
            Vector((side * 0.29 * r, YI[i] + MY[i], 0.108)),
            Vector((side * 0.355 * r, YI[i] + FY[i], 0.0)),
        ]
        rv, _ = tube(
            pts, leg_radius, 6, leg_weights(CHAIN[i], side),
            lambda t, c: (0.01 + 0.48 * c, 0.01 + 0.48 * t), rings=16,
        )
        for ti, ring in enumerate(rv):
            for k, v in enumerate(ring):
                leg_verts.append((v, side, ti / (len(rv) - 1), k))

# ---------------------------------------------------------------- fangs and pedipalps (mandible and antenna bones)
FANG_UV0, FANG_UV1 = (0.67, 0.03), (0.67, 0.47)
for side in (-1, 1):
    nm = "L" if side < 0 else "R"
    base = Vector((side * 0.026, -0.212, 0.052))
    pts = [base, base + Vector((side * 0.004, -0.02, -0.02)), base + Vector((side * -0.004, -0.032, -0.036)), base + Vector((side * -0.012, -0.028, -0.05))]
    tube(pts, lambda t: 0.0145 * (1 - t) + 0.0035 * t, 6, lambda co, t: {f"mandible_{nm}": 1.0}, lambda t, c: (0.60 + 0.12 * c, 0.03 + 0.44 * t), rings=7)
    pb = Vector((side * 0.05, -0.2, 0.068))
    pp = [pb, pb + Vector((side * 0.03, -0.045, -0.006)), pb + Vector((side * 0.035, -0.092, -0.03)), pb + Vector((side * 0.03, -0.125, -0.06))]
    tube(pp, lambda t: 0.0095 * (1 - t) + 0.0045 * t, 5, lambda co, t: ({"head": 1 - t, f"antenna_{nm}": t}), lambda t, c: (0.04 + 0.4 * c, 0.04 + 0.4 * t), rings=7)

# ---------------------------------------------------------------- eyes: two large, six small, glossy
EYE_UV = (0.88, 0.26)  # origin of the eye texel region in uv (x 900..1023, y 512..767)
EYES = [  # direction from the cephalothorax centre, radius
    ((0.16, -1.0, 0.18), 0.0125), ((-0.16, -1.0, 0.18), 0.0125),
    ((0.40, -0.92, 0.28), 0.0085), ((-0.40, -0.92, 0.28), 0.0085),
    ((0.30, -0.80, 0.62), 0.0075), ((-0.30, -0.80, 0.62), 0.0075),
    ((0.12, -0.55, 0.86), 0.0068), ((-0.12, -0.55, 0.86), 0.0068),
]
for d, rad in EYES:
    c = surface_point(ceph_c, ceph_r, d)
    nrm = Vector((d[0] / ceph_r[0] ** 2, d[1] / ceph_r[1] ** 2, d[2] / ceph_r[2] ** 2)).normalized()
    ctr = c + nrm * rad * 0.35
    r = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=rad)
    for p in r["verts"]:
        p.co += ctr
        setw(p, {"head": 0.6, "thorax": 0.4})
    for f in {f for p in r["verts"] for f in p.link_faces}:
        for l in f.loops:
            n = (l.vert.co - ctr).normalized()
            l[uvl].uv = (0.885 + 0.1 * (0.5 + 0.5 * n.x), 0.26 + 0.22 * (0.5 + 0.5 * n.z))

# ---------------------------------------------------------------- hair: thin cones, dark root to pale tip
BR_ROOT, BR_TIP = (0.567, 0.05), (0.567, 0.45)
random.seed(2829)
for v, side, t, k in leg_verts:
    if t < 0.06 or t > 0.97 or random.random() > 0.3:
        continue
    # outward from the limb: the ring column angle (k of 6) in the plane across the limb, plus a lift and a sideways lean
    d = Vector((side * 0.55, 0, 0.35)) + Vector((0, random.uniform(-0.5, 0.5), random.uniform(0.0, 0.8)))
    a = 2 * math.pi * k / 6
    d += Vector((0, math.cos(a), math.sin(a))) * 0.9
    ln = random.uniform(0.03, 0.05) * (1.15 - 0.5 * t)
    add_cone(v.co, d, ln, 0.003, dict(W[v]), BR_ROOT, BR_TIP)
for p in abd_vs:
    if p.co.z > abd_c[2] - 0.02 and random.random() < 0.4:
        n = (p.co - Vector(abd_c)).normalized()
        add_cone(p.co, n + Vector((0, 0.35, 0.1)), random.uniform(0.024, 0.038), 0.0034, dict(W[p]), BR_ROOT, BR_TIP)
for p in ceph_vs:
    if p.co.z > ceph_c[2] + 0.01 and p.co.y > -0.15 and random.random() < 0.5:
        n = (p.co - Vector(ceph_c)).normalized()
        add_cone(p.co, n + Vector((0, 0.25, 0.1)), random.uniform(0.018, 0.03), 0.003, dict(W[p]), BR_ROOT, BR_TIP)
# spinnerets under the rear tip
for x in (-0.012, 0.012):
    b = Vector((x, 0.318, 0.075))
    add_cone(b, Vector((0, 1.0, -0.25)), 0.03, 0.01, {"abdomen": 1.0}, FANG_UV0, FANG_UV1, sides=5)

# Believable size (Dom 28 Oct: a big dog at most): shrink the whole mesh about the origin, feet stay on the ground. The bones are untouched,
# so the rig, the clips and the manifest scale (3) are the roach's; the spider ends up about 1.3 m across the legs in game.
SIZE = 0.62
for v in bm.verts:
    v.co *= SIZE
bm.normal_update()
mesh = bpy.data.meshes.new("ARM Giant Spider")
bm.to_mesh(mesh)
bm.free()
for p in mesh.polygons:
    p.use_smooth = True
mesh.materials.append(mat)
obj.data = mesh
obj.name = "ARM Giant Spider"
bpy.data.meshes.remove(old)
# vertex group names live on the mesh: recreate them in the original index order so the deform layer indices line up
for idx in sorted(gname):
    obj.vertex_groups.new(name=gname[idx])
bpy.context.view_layer.objects.active = obj
obj.select_set(True)

# ---------------------------------------------------------------- material
mat.name = "Dark hairy chitin"
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


alb, orm, nrm = img("spider-albedo", D + "albedo.png", "sRGB"), img("spider-orm", D + "orm.png", "Non-Color"), img("spider-normal", D + "normal.png", "Non-Color")
nt.links.new(alb.outputs["Color"], bsdf.inputs["Base Color"])
sep = nt.nodes.new("ShaderNodeSeparateColor")
nt.links.new(orm.outputs["Color"], sep.inputs["Color"])
nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
nm = nt.nodes.new("ShaderNodeNormalMap")
nt.links.new(nrm.outputs["Color"], nm.inputs["Color"])
nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
mat.use_backface_culling = False

print("TRIS", sum(len(p.vertices) - 2 for p in mesh.polygons), "VERTS", len(mesh.vertices))
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", export_animations=True, export_animation_mode="ACTIONS",
    export_image_format="WEBP", export_image_quality=80, export_apply=False, export_yup=True,
)
print("EXPORTED", OUT)
