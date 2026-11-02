"""Rat King (Blender, CPU). Keeps the original rat rig (24 bones, 7 clips, same names) and its mesh; adds a mass of fused low-poly
rats on the back and flanks whose tails are knotted together behind the cluster, a few scar welts, and re-grades the coat dark brown.
No crown, ridge, spikes or glowing eyes (Dom, 28 Oct: realistic, grounded). Every new vertex copies the skin weights of the nearest original vertex (no new bones). Original vertices keep their indices.
Run: blender -b -P build.py -- out.glb"""
import bpy, bmesh, math, random, sys
from mathutils import Vector, kdtree
from mathutils import noise as mnoise

OUT = sys.argv[-1]
D = "/srv/dev-jobs/art-rat-king/"
random.seed(2810)
bpy.ops.wm.read_factory_settings(use_empty=True)
# 30 fps so every clip length (0.333 to 1.6 s) lands on a whole frame and the export keeps the source durations
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=D + "original-rat.glb")
for o in list(bpy.data.objects):
    if o.name.startswith("Icosphere"):
        bpy.data.objects.remove(o)
obj = [o for o in bpy.data.objects if o.type == "MESH"][0]
mesh = obj.data
gname = {g.index: g.name for g in obj.vertex_groups}

bm = bmesh.new()
bm.from_mesh(mesh)
uvl = bm.loops.layers.uv.active
col = bm.loops.layers.color["Color"]
dl = bm.verts.layers.deform.verify()
bm.verts.ensure_lookup_table()
N_ORIG_V, N_ORIG_F = len(bm.verts), len(bm.faces)
bm.normal_update()
OC = [v.co.copy() for v in bm.verts]
ON = [v.normal.copy() for v in bm.verts]

# --- grade the original loops dark warm (per material: 0 coat, 1 skin, 2 eyes and nose, 3 ivory)
TINT = {0: (0.5, 0.4, 0.34), 1: (0.45, 0.34, 0.31), 2: (1.0, 1.0, 1.0), 3: (0.85, 0.66, 0.45)}
BARE = (0.42, 0.27, 0.24)  # bare scarred skin showing through the fur


def patch(co, c, seed=0.0):
    """Blotchy fur: darker and lighter fur, and patches of bare scarred skin (vertex colour, by position)."""
    s = Vector((seed, seed * 0.7, seed * 1.3))
    n = mnoise.noise(co * 48.0 + s)
    m = mnoise.noise(co * 17.0 + s + Vector((7, 3, 1)))
    if n > 0.18:
        t = min(1.0, (n - 0.18) * 3.5)
        return tuple(c[i] * (1 - t) + BARE[i] * t for i in range(3))
    k = 0.72 + 0.4 * m
    return (c[0] * k, c[1] * k, c[2] * k)


stats = {}
for f in bm.faces:
    for l in f.loops:
        c = l[col]
        stats.setdefault(f.material_index, []).append(tuple(c))
        t = TINT[f.material_index]
        base = (c[0] * t[0], c[1] * t[1], c[2] * t[2])
        if f.material_index == 0:
            base = patch(l.vert.co, base)
        l[col] = (*base, c[3])
for k, v in sorted(stats.items()):
    print("ORIGCOL", k, len(v), [round(sum(x[i] for x in v) / len(v), 3) for i in range(4)])

kd = kdtree.KDTree(N_ORIG_V)
for i, v in enumerate(bm.verts):
    kd.insert(v.co, i)
kd.balance()
src_w = {i: dict(v[dl].items()) for i, v in enumerate(bm.verts)}
dom = {i: gname[max(w.items(), key=lambda kv: kv[1])[0]] if w else "root" for i, w in src_w.items()}


def weight(v):
    _, i, _ = kd.find(v.co)
    v[dl].clear()
    for g, w in src_w[i].items():
        v[dl][g] = w


# probes: head and body extents, from the original vertices
def extent(names):
    vs = [OC[i] for i in range(N_ORIG_V) if dom[i] in names]
    return [(round(min(c[k] for c in vs), 3), round(max(c[k] for c in vs), 3)) for k in range(3)]


print("HEAD", extent({"head"}), "JAW", extent({"jaw"}), "SPINE", extent({"spine"}), "CHEST", extent({"chest"}), "PELVIS", extent({"pelvis"}))


def top_z(y, x=0.0, r=0.02):
    zs = [OC[i].z for i in range(N_ORIG_V) if abs(OC[i].y - y) < r and abs(OC[i].x - x) < r]
    return max(zs) if zs else 0.1


uv_next = [0]


def new_part(verts, faces, mat, color, patchy=False):
    """Give a primitive its material, vertex colour, UVs and skin weights."""
    part = uv_next[0]
    uv_next[0] += 1
    u0, v0 = 0.08 + 0.3 * (part % 3), 0.08 + 0.3 * ((part // 3) % 3)
    cs = [v.co for v in verts]
    lo = Vector((min(c[0] for c in cs), min(c[1] for c in cs), min(c[2] for c in cs)))
    hi = Vector((max(c[0] for c in cs), max(c[1] for c in cs), max(c[2] for c in cs)))
    span = [(hi[k] - lo[k]) or 1.0 for k in range(3)]
    for v in verts:
        weight(v)
    for f in faces:
        f.material_index = mat
        f.smooth = True
        for l in f.loops:
            l[col] = (*(patch(l.vert.co, color, part * 1.7) if patchy else color), 1.0)
            a = (l.vert.co.x - lo.x) / span[0]
            b = (l.vert.co.z - lo.z) / span[2] * 0.5 + (l.vert.co.y - lo.y) / span[1] * 0.5
            l[uvl].uv = (u0 + 0.26 * a, v0 + 0.26 * b)


def sphere(center, radii, frame, u=8, v=6):
    r = bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    verts = r["verts"]
    rx, fy, uz = frame
    for vt in verts:
        p = vt.co
        vt.co = center + rx * (p.x * radii[0]) + fy * (p.y * radii[1]) + uz * (p.z * radii[2])
    faces = list({f for vt in verts for f in vt.link_faces})
    return verts, faces


def cone(base, direction, length, radius, sides=5, bend=Vector((0, 0, 0))):
    d = direction.normalized()
    t = d.cross(Vector((0, 0, 1)))
    if t.length < 1e-3:
        t = d.cross(Vector((1, 0, 0)))
    t.normalize()
    b = d.cross(t)
    ring = [bm.verts.new(base + t * math.cos(2 * math.pi * k / sides) * radius + b * math.sin(2 * math.pi * k / sides) * radius) for k in range(sides)]
    tip = bm.verts.new(base + d * length + bend)
    faces = [bm.faces.new((ring[k], ring[(k + 1) % sides], tip)) for k in range(sides)]
    return ring + [tip], faces


def tube(path, radii, sides=5):
    """A tapered tube along `path` (list of Vector), closed to a point at the end."""
    rings = []
    prev_t = None
    for i, p in enumerate(path):
        d = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        n = d.cross(Vector((0, 0, 1)))
        if n.length < 1e-3:
            n = d.cross(Vector((1, 0, 0)))
        n.normalize()
        b = d.cross(n)
        rings.append([bm.verts.new(p + n * math.cos(2 * math.pi * k / sides) * radii[i] + b * math.sin(2 * math.pi * k / sides) * radii[i]) for k in range(sides)])
    faces = []
    for i in range(len(rings) - 1):
        for k in range(sides):
            faces.append(bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k])))
    tip = bm.verts.new(path[-1] + (path[-1] - path[-2]).normalized() * radii[-1] * 2)
    for k in range(sides):
        faces.append(bm.faces.new((rings[-1][k], rings[-1][(k + 1) % sides], tip)))
    verts = [v for r in rings for v in r] + [tip]
    return verts, faces


Z = Vector((0, 0, 1))
KNOT = Vector((0.085, 0.2, 0.075))  # where every tail meets and twists: off the right flank, so it shows from the front camera
ROPE = Vector((0.5, 0.75, 0.45)).normalized()  # the twisted tails run back, out and up from the knot, then droop
ROPE_N1 = ROPE.cross(Z).normalized()
ROPE_N2 = ROPE.cross(ROPE_N1)
KNOT_T = 0.55  # share of each tail that runs from its rat to the knot


def mini_rat(org, face, s, fur, tail_drop=0.12, tail_side=0.0, eyes=True):
    f = Vector(face).normalized()
    r = f.cross(Z)
    if r.length < 1e-3:
        r = Vector((1, 0, 0))
    r.normalize()
    u = r.cross(f)
    fr = (r, f, u)
    org = Vector(org)

    def P(x, y, z):
        return org + (r * x + f * y + u * z) * s

    vs, fs = sphere(P(0, 0, 0), (0.040 * s, 0.078 * s, 0.037 * s), fr, u=10, v=7)
    new_part(vs, fs, 0, fur, patchy=True)
    vs, fs = sphere(P(0, 0.09, 0.006), (0.028 * s, 0.040 * s, 0.026 * s), fr, u=8, v=6)
    new_part(vs, fs, 0, fur, patchy=True)
    vs, fs = cone(P(0, 0.118, 0.004), f, 0.04 * s, 0.017 * s, sides=6)
    new_part(vs, fs, 0, (fur[0] * 0.55, fur[1] * 0.45, fur[2] * 0.42))
    for sx in (-1, 1):
        # small torn ears, dark grey-brown
        vs, fs = sphere(P(sx * 0.021, 0.078, 0.026), (0.003 * s, 0.010 * s, 0.013 * s), fr, u=6, v=4)
        new_part(vs, fs, 1, (0.30, 0.22, 0.20))
        if eyes:
            vs, fs = sphere(P(sx * 0.022, 0.102, 0.015), (0.0048 * s,) * 3, fr, u=5, v=3)
            new_part(vs, fs, 2, (0.10, 0.09, 0.08))
    # the tail runs back to the shared knot behind the cluster, where all the tails twist together
    start = P(0, -0.07, 0)
    path, rad = [], []
    for i in range(15):
        t = i / 14
        if t < KNOT_T:
            p = start.lerp(KNOT, t / KNOT_T) + Vector((0, 0, -0.025 * math.sin(t / KNOT_T * math.pi)))
        else:
            q = (t - KNOT_T) / (1 - KNOT_T)
            a = tail_side + q * 22
            r_h = 0.011 + 0.03 * max(0.0, q - 0.7) / 0.3  # tight twist, splaying at the loose ends
            p = KNOT + ROPE * (q * 0.24) + ROPE_N1 * (r_h * math.cos(a)) + ROPE_N2 * (r_h * math.sin(a)) - Z * (q * q * 0.05)
        path.append(Vector((p.x, p.y, max(0.008, p.z))))
        rad.append(0.0098 * (1 - 0.65 * t * t))
    vs, fs = tube(path, rad, sides=5)
    new_part(vs, fs, 1, (0.42, 0.31, 0.28), patchy=True)


# --- the mass of fused rats: (origin, head direction, scale, fur tint). Head is -Y on the king; the king's back top is about z 0.165.
RATS = [
    ((-0.035, 0.075, 0.150), (-0.55, -0.35, 0.75), 0.95, (1.0, 0.8, 0.66)),
    ((0.042, 0.005, 0.155), (0.75, -0.25, 0.6), 0.90, (0.62, 0.6, 0.62)),
    ((0.005, 0.125, 0.145), (0.15, 0.9, 0.55), 0.85, (0.82, 0.68, 0.58)),
    ((-0.080, 0.04, 0.105), (-1.0, -0.25, 0.12), 0.80, (0.5, 0.47, 0.47)),
    ((0.082, 0.085, 0.105), (1.0, 0.35, 0.2), 0.80, (0.95, 0.78, 0.65)),
    ((0.0, 0.215, 0.085), (-0.1, 1.0, 0.1), 0.75, (0.66, 0.6, 0.58)),
]
for k, (o, fd, s, fur) in enumerate(RATS):
    mini_rat(o, fd, s, (fur[0] * 0.6, fur[1] * 0.5, fur[2] * 0.44), tail_side=k * math.pi / 3)

# the knot itself: a fist-sized mass of tails and scar tissue where they meet
vs, fs = sphere(KNOT + ROPE * 0.03, (0.026, 0.036, 0.024), (ROPE_N1, ROPE, ROPE_N2), u=9, v=6)
new_part(vs, fs, 1, (0.40, 0.29, 0.26), patchy=True)

# --- scars: pale raised welts on the head and flank
for (tx, ty, tz), ang, ln in (((-0.035, -0.12, 0.13), 0.7, 0.032), ((0.03, -0.15, 0.12), -0.6, 0.03), ((-0.06, 0.0, 0.12), 1.2, 0.04), ((0.07, 0.03, 0.12), -1.0, 0.04), ((0.0, -0.075, 0.15), 0.3, 0.03)):
    _, i, _ = kd.find(Vector((tx, ty, tz)))
    n = ON[i].normalized() if ON[i].length else Z
    t1 = n.cross(Z)
    if t1.length < 1e-3:
        t1 = Vector((1, 0, 0))
    t1.normalize()
    t2 = n.cross(t1)
    d = t1 * math.cos(ang) + t2 * math.sin(ang)
    w = n.cross(d).normalized()
    vs, fs = sphere(OC[i] + n * 0.0006, (0.0032, ln, 0.0032), (w, d, n), u=6, v=3)
    new_part(vs, fs, 1, (0.9, 0.62, 0.55))

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

# --- coat texture: swap the image in the existing coat material (name stays "Ash and soot worn fur", guarded by animal-appearance.js)
for m in mesh.materials:
    for n in m.node_tree.nodes:
        if n.type == "TEX_IMAGE":
            i = bpy.data.images.load(D + "king-coat.png")
            i.name = "king-coat"
            n.image = i
print("TRIS", sum(len(p.vertices) - 2 for p in mesh.polygons), "VERTS", len(mesh.vertices), "ORIGV", N_ORIG_V, "ORIGF", N_ORIG_F)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", export_animations=True, export_animation_mode="ACTIONS",
    export_image_format="WEBP", export_image_quality=80, export_apply=False, export_yup=True,
)
print("EXPORTED", OUT)
