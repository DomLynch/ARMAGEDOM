"""Elephant mesh for the wolf's own 31-bone QuadRig (Blender 5.2, CPU, headless).

Builds a scarred, mutated, ash-grey elephant from swept tubes and ellipsoids in the wolf's rest pose, weights every vertex to the
nearest existing joints (no new bones, no re-parenting), unwraps it, and writes the split vertex arrays for elephant_swap.mjs.
Run: blender -b -P elephant_mesh.py -- /srv/dev-jobs/elephant/wolf.glb /srv/dev-jobs/elephant/elephant_mesh.npz
Coordinates are Blender's (x lateral, -y forward, z up); the swap script converts to glTF (x, z, -y).
"""
import bpy, bmesh, math, random, sys, json
import numpy as np
from mathutils import Vector

SRC, OUT = sys.argv[-2], sys.argv[-1]
random.seed(2810)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
for o in list(bpy.data.objects):
    if o.type == "MESH":  # the wolf's own mesh and the importer's bone shape: only the armature is kept
        bpy.data.objects.remove(o)
arm =[o for o in bpy.data.objects if o.type == "ARMATURE"][0]
BONE = {b.name: (Vector(b.head_local), Vector(b.tail_local)) for b in arm.data.bones}
JOINTS = sorted(BONE)  # the order npz uses; the swap script maps names to the skin's joint indices

V = []  # vertices (Vector)
F = []  # faces (tuples of vertex indices)
PART = []  # part name per vertex
WPOS = []  # where the vertex's skin weights are sampled (a spur or lump tip uses its base)
PARTS = ["body", "head", "trunk", "tusk", "ear", "leg", "foot", "nail", "tail", "spur", "lump", "eye", "jaw", "tuft"]


def add(verts, faces, part, wpos=None):
    base = len(V)
    for v in verts:
        V.append(Vector(v))
        PART.append(PARTS.index(part))
        WPOS.append(Vector(wpos) if wpos is not None else None)
    for f in faces:
        F.append(tuple(base + i for i in f))
    return base


from mathutils import noise as mnoise


def noise(p, f=1.0):
    return mnoise.noise(Vector(p) * f)


def ellipsoid(c, r, part, seg=20, rings=12, wobble=0.0, wf=30.0, wpos=None, shape=None):
    verts, faces = [], []
    c = Vector(c)
    for i in range(rings + 1):
        th = math.pi * i / rings
        for j in range(seg):
            ph = 2 * math.pi * j / seg
            if i == 0 or i == rings:
                if j:
                    continue
            d = Vector((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)))
            p = Vector((d.x * r[0], d.y * r[1], d.z * r[2]))
            if wobble:
                p *= 1 + wobble * noise(c + d * 3, wf / 10)
            if shape:
                p = shape(c + p) - c
            verts.append(c + p)
    # indices: pole0, then rings 1..rings-1 of seg verts, then pole1
    def idx(i, j):
        if i == 0:
            return 0
        if i == rings:
            return 1 + (rings - 1) * seg
        return 1 + (i - 1) * seg + (j % seg)
    for i in range(rings):
        for j in range(seg):
            a, b, c2, d2 = idx(i, j), idx(i, j + 1), idx(i + 1, j + 1), idx(i + 1, j)
            if i == 0:
                faces.append((a, c2, d2))
            elif i == rings - 1:
                faces.append((a, b, d2))
            else:
                faces.append((a, b, c2, d2))
    return add(verts, faces, part, wpos)


def tube(path, radii, part, seg=10, rings_per=1, wrinkle=0.0, wk=60.0, taper_cap=True, squash=(1.0, 1.0), wpos=None, ridge=0.0):
    """Sweeps a circle along a polyline with radii per point; rounded end caps. `rings_per` subdivides each path span."""
    pts, rad = [], []
    path = [Vector(p) for p in path]
    for i in range(len(path) - 1):
        for k in range(rings_per):
            t = k / rings_per
            pts.append(path[i].lerp(path[i + 1], t))
            rad.append(radii[i] * (1 - t) + radii[i + 1] * t)
    pts.append(path[-1])
    rad.append(radii[-1])
    n = len(pts)
    tans = []
    for i in range(n):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, n - 1)]
        tans.append((b - a).normalized())
    ref = Vector((1, 0, 0)) if abs(tans[0].x) < 0.9 else Vector((0, 1, 0))
    nrm = (ref - tans[0] * ref.dot(tans[0])).normalized()
    frames = []
    for i in range(n):
        nrm = (nrm - tans[i] * nrm.dot(tans[i])).normalized()
        frames.append((nrm.copy(), tans[i].cross(nrm).normalized()))
    verts, faces = [], []
    s0 = len(verts)
    verts.append(pts[0] - tans[0] * rad[0] * 0.6)  # start cap tip
    for i in range(n):
        N, B = frames[i]
        for j in range(seg):
            a = 2 * math.pi * j / seg
            rr = rad[i]
            if wrinkle:
                rr *= 1 + wrinkle * math.sin(i * 1.3 + wk * 0.0) * (1 if i % 2 else -1) * 0.6
            if ridge:
                rr *= 1 + ridge * noise(pts[i] + Vector((math.cos(a), math.sin(a), 0)) * 0.02, wk)
            verts.append(pts[i] + (N * math.cos(a) * squash[0] + B * math.sin(a) * squash[1]) * rr)
    e = len(verts)
    verts.append(pts[-1] + tans[-1] * rad[-1] * (0.6 if taper_cap else 0.0))
    for j in range(seg):
        faces.append((0, 1 + (j + 1) % seg, 1 + j))
    for i in range(n - 1):
        for j in range(seg):
            a = 1 + i * seg + j
            b = 1 + i * seg + (j + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    last = 1 + (n - 1) * seg
    for j in range(seg):
        faces.append((last + j, last + (j + 1) % seg, e))
    return add(verts, faces, part, wpos)


def plate(center, ax_u, ax_v, hu, hv, thick, part, spokes=18, rings=5, outline=None, rag=0.0):
    """A flat rounded slab (an ear): concentric rings on two faces joined at the rim. outline(angle) -> radius factor."""
    c, U, W = Vector(center), Vector(ax_u).normalized(), Vector(ax_v).normalized()
    Nn = U.cross(W).normalized()
    verts, faces = [], []
    for side in (+1, -1):
        base = len(verts)
        verts.append(c + Nn * thick * 0.5 * side * 1.0)
        for r in range(1, rings + 1):
            for s in range(spokes):
                a = 2 * math.pi * s / spokes
                f = outline(a) if outline else 1.0
                if rag and r == rings:
                    f *= 1 - rag * (0.5 + 0.5 * noise((math.cos(a) * 3, math.sin(a) * 3, side * 0.0), 1.7))
                t = r / rings
                lift = (1 - t * t) * thick * 0.5 * side + thick * 0.15 * side * (1 - t)  # slightly domed
                p = c + U * math.cos(a) * hu * t * f + W * math.sin(a) * hv * t * f + Nn * lift
                verts.append(p)
        for s in range(spokes):
            a, b = base + 1 + s, base + 1 + (s + 1) % spokes
            faces.append((base, a, b) if side > 0 else (base, b, a))
        for r in range(1, rings):
            for s in range(spokes):
                a = base + 1 + (r - 1) * spokes + s
                b = base + 1 + (r - 1) * spokes + (s + 1) % spokes
                c2, d2 = b + spokes, a + spokes
                faces.append((a, b, c2, d2) if side > 0 else (a, d2, c2, b))
    # rim: join the two outermost rings
    top = 1 + (rings - 1) * spokes
    bot = (1 + rings * spokes) + top
    for s in range(spokes):
        a, b = top + s, top + (s + 1) % spokes
        a2, b2 = bot + s, bot + (s + 1) % spokes
        faces.append((a, a2, b2, b))
    return add(verts, faces, part)


# ---------------------------------------------------------------- rig facts
HIP = {"L": Vector((0.092, 0.222, 0.36)), "R": Vector((-0.092, 0.222, 0.36))}
SHO = {"L": Vector((0.092, -0.182, 0.36)), "R": Vector((-0.092, -0.182, 0.36))}


BODY_Z, BODY_RX, BODY_RZ = 0.345, 0.16, 0.185  # barrel centre height and half width / half depth


def body_r(y):
    t = 1 - ((y - 0.03) / 0.325) ** 2
    return math.sqrt(max(t, 0.0))


def body_shape(p):
    # heavier shoulder hump and a slung belly, spine arched
    y = p.y
    hump = math.exp(-(((y + 0.1) / 0.16) ** 2))
    q = p.copy()
    q.x *= 1 + 0.10 * hump
    q.z += 0.025 * hump * (1 if p.z > BODY_Z else 0.4)
    if p.z < BODY_Z:
        q.z -= 0.02 * body_r(y)
    return q


# ---------------------------------------------------------------- body, head, jaw
ellipsoid((0, 0.03, BODY_Z), (BODY_RX, 0.325, BODY_RZ), "body", seg=28, rings=16, wobble=0.05, wf=22, shape=body_shape)
# one smooth forehead dome (no separate lumps), slightly taller and fuller at the cheeks
ellipsoid((0, -0.385, 0.462), (0.112, 0.125, 0.145), "head", seg=26, rings=14, wobble=0.015, wf=26)
for sx in (+1, -1):
    ellipsoid((sx * 0.094, -0.44, 0.475), (0.009, 0.009, 0.009), "eye", seg=8, rings=5)
ellipsoid((0, -0.455, 0.358), (0.06, 0.055, 0.028), "jaw", seg=14, rings=8, wobble=0.05, wf=30)  # lower lip

# ---------------------------------------------------------------- legs and feet (columns following the wolf's bone chain)
for side, sx in (("L", +1), ("R", -1)):
    for kind, top, bottom, rt, rb in (("hind", HIP[side], Vector((sx * 0.088, 0.236, 0.03)), 0.082, 0.058),
                                       ("front", SHO[side], Vector((sx * 0.088, -0.172, 0.03)), 0.075, 0.055)):
        # thigh / shoulder mass: rounds the join so the column never ends in a visible flat cap
        ellipsoid((top.x * 0.97, top.y + (0.0 if kind == "hind" else -0.01), 0.385), (0.1, 0.135, 0.125), "body", seg=14, rings=8, wobble=0.04, wf=26)
        mid = top.lerp(bottom, 0.5)
        mid.x += sx * 0.004
        path = [top, top.lerp(bottom, 0.25), mid, top.lerp(bottom, 0.75), bottom]
        tube(path, [rt, rt * 0.88, (rt + rb) / 2 * 0.95, rb * 1.02, rb * 1.1], "leg", seg=14, rings_per=4, ridge=0.1, wk=55, wrinkle=0.045)
        # round pad
        ellipsoid((bottom.x, bottom.y - (0.012 if kind == "front" else 0.0), 0.017), (rb * 1.2, rb * 1.3, 0.02), "foot", seg=14, rings=6)
        for k in range(3):  # toe nails
            ang = (k - 1) * 0.55
            ellipsoid((bottom.x + math.sin(ang) * rb * 1.15, bottom.y - math.cos(ang) * rb * 1.2 - (0.012 if kind == "front" else 0), 0.021),
                      (0.012, 0.008, 0.01), "nail", seg=8, rings=4)

# ---------------------------------------------------------------- trunk: a hanging, ringed, scarred, uplifted-at-the-tip trunk
TRUNK = [(0, -0.46, 0.415), (0, -0.51, 0.345), (0, -0.545, 0.265), (0, -0.56, 0.19), (0, -0.56, 0.125), (0, -0.535, 0.08), (0, -0.495, 0.06), (0, -0.46, 0.075)]
TR = [0.068, 0.06, 0.052, 0.045, 0.039, 0.033, 0.027, 0.02]
tube(TRUNK, TR, "trunk", seg=12, rings_per=3, squash=(1.08, 0.96), ridge=0.1, wk=45)

# ---------------------------------------------------------------- tusks: right long and snapped, left a short jagged stub
tube([(-0.066, -0.44, 0.37), (-0.082, -0.49, 0.335), (-0.098, -0.55, 0.305), (-0.104, -0.605, 0.3), (-0.1, -0.65, 0.325)], [0.03, 0.026, 0.02, 0.016, 0.0125], "tusk", seg=8, rings_per=2, ridge=0.1, wk=80, taper_cap=False)
tube([(0.066, -0.44, 0.37), (0.078, -0.475, 0.348), (0.084, -0.505, 0.332)], [0.028, 0.023, 0.017], "tusk", seg=8, rings_per=2, ridge=0.15, wk=80, taper_cap=False)

# ---------------------------------------------------------------- ears: big, torn, hanging and flared
def ear_outline(a):
    # teardrop: wider on the lower outer side, tapering to the attachment
    s = math.sin(a)  # +s is down the ear: a pointed lobe below, a flatter top, a narrow root
    f = 0.8 + 0.32 * max(0.0, s) ** 3 - 0.08 * max(0.0, -s) + 0.07 * math.cos(3 * a)
    return f * (0.78 if math.cos(a) < -0.5 else 1.0)

for sx in (+1, -1):
    plate((sx * 0.225, -0.325, 0.43), (sx * 0.9, 0.43, 0.0), (0.0, 0.1, -1.0), 0.155, 0.185, 0.014, "ear", spokes=20, rings=6, outline=ear_outline, rag=0.35)

# ---------------------------------------------------------------- tail with a ragged tuft
tube([(0, 0.335, 0.34), (0, 0.419, 0.275), (0, 0.479, 0.195), (0, 0.519, 0.118), (0, 0.56, 0.06)], [0.026, 0.017, 0.012, 0.01, 0.009], "tail", seg=8, rings_per=2)
for k in range(5):
    ang = k * 1.26
    tube([(0, 0.56, 0.065), (math.sin(ang) * 0.012, 0.575 + 0.01 * math.cos(ang), 0.045), (math.sin(ang) * 0.02, 0.585 + 0.012 * math.cos(ang), 0.012)], [0.009, 0.007, 0.002], "tuft", seg=5)

# ---------------------------------------------------------------- mutation: dorsal bone spurs and raw lumps
def surf(y, phi_deg, inset=0.0):
    ph = math.radians(phi_deg)
    r = body_r(y)
    return Vector((BODY_RX * r * math.cos(ph), y, BODY_Z + BODY_RZ * r * math.sin(ph)))

SPURS = []  # 28 Oct (Dom): realistic 2030 game, no bone spikes or fantasy flourish; the mutation is scars, a snapped tusk and tumour-like growths
for i, (y, h) in enumerate(SPURS):
    ph = 90 if i < 7 else 135
    b = body_shape(surf(y, ph)) + Vector((0, 0, -0.012))
    lean = Vector((random.uniform(-0.25, 0.25), 0.45 + random.uniform(-0.15, 0.25), 1.0)).normalized() if i < 7 else Vector((-0.9, 0.3, 0.6)).normalized()
    if i == 7:
        h = 0.07
    r0 = 0.017 + 0.004 * (i % 3)
    mid = b + lean * (h * 0.55) + Vector((0, 0.004, 0))
    tip = b + lean * h + Vector((0, 0.012, 0))
    tube([b, mid, tip], [r0, r0 * 0.6, 0.0035], "spur", seg=6, rings_per=1, wpos=b, taper_cap=False)

LUMPS = [(0.02, 22, 0.026), (-0.14, 40, 0.03), (0.2, 150, 0.024)]
for k, (y, phi, r) in enumerate(LUMPS):
    sgn = 1 if k % 2 == 0 else -1
    s = body_shape(surf(y, phi if sgn > 0 else 180 - phi))
    ellipsoid(s, (r, r * 1.2, r * 0.9), "lump", seg=10, rings=6, wobble=0.15, wf=60, wpos=s)

# ---------------------------------------------------------------- weights
SPINE_CHAIN = [("spine0", 0.25), ("spine1", 0.09), ("spine2", -0.04), ("spine3", -0.15), ("spine4", -0.235), ("neck", -0.31)]
LEGCH = {"hind": ["hind_up", "hind_low", "hind_pastern", "hind_paw"], "front": ["front_up", "front_low", "front_pastern", "front_paw"]}


def seg_t(p, a, b):
    ab = b - a
    return max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))


def spine_w(p):
    y = p.y
    ch = SPINE_CHAIN
    if y >= ch[0][1]:
        return {"spine0": 1.0}
    if y <= ch[-1][1]:
        return {"neck": 1.0}
    for (n0, y0), (n1, y1) in zip(ch, ch[1:]):
        if y1 <= y <= y0:
            t = (y0 - y) / (y0 - y1)
            t = t * t * (3 - 2 * t)
            return {n0: 1 - t, n1: t}
    return {"spine0": 1.0}


def leg_w(p, side, kind):
    names = [f"{n}_{side}" for n in LEGCH[kind]]
    z = p.z
    # z breakpoints between up / low / pastern / paw, with soft blends
    knots = [(0.335, names[0]), (0.219, names[1]), (0.129, names[2]), (0.045, names[3])]
    w = {}
    if z >= knots[0][0]:
        return {names[0]: 1.0}
    if z <= knots[-1][0]:
        return {names[3]: 1.0}
    for (z0, n0), (z1, n1) in zip(knots, knots[1:]):
        if z1 <= z <= z0:
            t = (z0 - z) / (z0 - z1)
            t = max(0.0, min(1.0, (t - 0.25) / 0.5))  # blend only across the middle half of each span
            t = t * t * (3 - 2 * t)
            w = {n0: 1 - t, n1: t}
    return w


def add_w(dst, src, k):
    for n, v in src.items():
        dst[n] = dst.get(n, 0.0) + v * k


def weights(p, part):
    p = Vector(p)
    side = "L" if p.x >= 0 else "R"
    w = {}
    name = PARTS[part]
    if name in ("body", "lump", "spur"):
        add_w(w, spine_w(p), 1.0)
        for kind, J in (("hind", HIP[side]), ("front", SHO[side])):
            d = (p - J).length
            k = max(0.0, 1.0 - d / 0.16) * 0.7
            if k > 0:
                add_w(w, {f"{LEGCH[kind][0]}_{side}": 1.0}, k)
        if p.y > 0.28:  # rump: a little tail root
            add_w(w, {"tail0": 1.0}, 0.15)
    elif name == "leg":
        kind = "hind" if p.y > 0.0 else "front"
        w = leg_w(p, side, kind)
        if p.z > 0.28:  # the top of the column belongs to the trunk of the body
            add_w(w, spine_w(p), 0.5)
    elif name in ("foot", "nail"):
        kind = "hind" if p.y > 0.0 else "front"
        w = {f"{LEGCH[kind][3]}_{side}": 0.8, f"{LEGCH[kind][2]}_{side}": 0.2}
    elif name in ("head", "trunk", "tusk", "eye"):
        w = {"head": 1.0}
        if name == "head" and p.y > -0.3:
            w = {"head": 0.4, "neck": 0.6}
        if name == "trunk" and p.z < 0.3:
            w = {"head": 0.85, "jaw": 0.15}
    elif name == "jaw":
        w = {"jaw": 0.8, "head": 0.2}
    elif name == "ear":
        t = min(1.0, max(0.0, (abs(p.x) - 0.075) / 0.07))
        w = {f"ear_{side}": t, "head": 1 - t}
    elif name in ("tail", "tuft"):
        a = [Vector(BONE[f"tail{i}"][0]) for i in range(4)] + [Vector(BONE["tail3"][1])]
        best = None
        for i in range(4):
            t = seg_t(p, a[i], a[i + 1])
            d = (a[i] + (a[i + 1] - a[i]) * t - p).length
            if best is None or d < best[0]:
                best = (d, i, t)
        _, i, t = best
        w = {f"tail{i}": 1 - t}
        w[f"tail{min(i + 1, 3)}"] = w.get(f"tail{min(i + 1, 3)}", 0) + t
        if p.y < 0.36:
            add_w(w, {"spine0": 1.0}, 0.4)
    top = sorted(((v, n) for n, v in w.items() if v > 1e-4), reverse=True)[:4]
    tot = sum(v for v, _ in top)
    return [(n, v / tot) for v, n in top]


# ---------------------------------------------------------------- build the Blender mesh, UV unwrap, export split arrays
mesh = bpy.data.meshes.new("elephant")
mesh.from_pydata([tuple(v) for v in V], [], F)
mesh.update()
for p in mesh.polygons:
    p.use_smooth = True
obj = bpy.data.objects.new("elephant", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=1e-6)
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=0.004, correct_aspect=True, scale_to_bounds=False)
bpy.ops.object.mode_set(mode="OBJECT")
mesh = obj.data
# remove_doubles reorders nothing it keeps, but vertex count may shrink: rebuild part/wpos by position of surviving verts
pos_part = {}
for v, part, w in zip(V, PART, WPOS):
    pos_part[(round(v.x, 6), round(v.y, 6), round(v.z, 6))] = (part, w)
uvl = mesh.uv_layers.active.data
mesh.calc_loop_triangles()
corner_n = [Vector(n.vector) for n in mesh.corner_normals]
verts_out, key_index = [], {}
tri_idx = []
vparts = []
for lt in mesh.loop_triangles:
    row = []
    for li, vi in zip(lt.loops, lt.vertices):
        v = mesh.vertices[vi]
        uv = uvl[li].uv
        n = corner_n[li] if corner_n else v.normal
        k = (vi, round(uv.x, 5), round(uv.y, 5), round(n.x, 3), round(n.y, 3), round(n.z, 3))
        if k not in key_index:
            key_index[k] = len(verts_out)
            kp = (round(v.co.x, 6), round(v.co.y, 6), round(v.co.z, 6))
            part, wp = pos_part.get(kp, (0, None))
            verts_out.append((v.co.copy(), n.copy(), (uv.x, uv.y), part, wp))
        row.append(key_index[k])
    tri_idx.append(row)
N = len(verts_out)
pos = np.zeros((N, 3), np.float32)
nor = np.zeros((N, 3), np.float32)
uvs = np.zeros((N, 2), np.float32)
part = np.zeros(N, np.int32)
jidx = np.zeros((N, 4), np.int32)
jw = np.zeros((N, 4), np.float32)
for i, (co, n, uv, pt, wp) in enumerate(verts_out):
    # glTF space: x, z, -y ; v flipped
    pos[i] = (co.x, co.z, -co.y)
    nn = n.normalized()
    nor[i] = (nn.x, nn.z, -nn.y)
    uvs[i] = (uv[0], 1.0 - uv[1])
    part[i] = pt
    ws = weights(wp if wp is not None else co, pt)
    for k, (bn, wv) in enumerate(ws):
        jidx[i, k] = JOINTS.index(bn)
        jw[i, k] = wv
tris = np.array(tri_idx, np.int32)
np.savez(OUT, pos=pos, nor=nor, uv=uvs, part=part, jidx=jidx, jw=jw, tris=tris, joints=np.array(JOINTS), parts=np.array(PARTS))
print("TRIS", len(tris), "VERTS", N, "BBOX", pos.min(0).tolist(), pos.max(0).tolist())
