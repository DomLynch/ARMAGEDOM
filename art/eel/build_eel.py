"""Eel (Blender 5.2 headless, CPU): keep the giant-salamander rig (QuadRig, 31 bones, 7 clips) and replace the mesh with a slick scarred
eel: lofted body on the spine and tail bones, a gaping head whose lower jaw follows the `jaw` bone, dorsal and anal fins, pectoral fins,
teeth, eyes. Skin weights are computed from the position along the body (no copy from the old mesh, legs unweighted).
Run: blender -b -P build_eel.py -- out.glb   (reads giant-salamander.glb, albedo.png, orm.png, normal.png next to it; writes tips.json)"""
import bpy, bmesh, math, random, sys, os, json
import numpy as np
from mathutils import Vector

OUT = sys.argv[-1]
D = os.path.dirname(os.path.abspath(OUT)) + "/"
random.seed(2810)
bpy.ops.wm.read_factory_settings(use_empty=True)
# the source clips are 30 fps (same fix as roach v3): a 24 fps scene would trim the last frame off every clip
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=D + "giant-salamander.glb")
for o in list(bpy.data.objects):
    if o.name.startswith("Icosphere"):
        bpy.data.objects.remove(o)
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
obj = bpy.data.objects["world-raw"]
mesh = obj.data
gidx = {g.name: g.index for g in obj.vertex_groups}

# ---- body profile (Blender axes: -Y is the head, Z up). knots: y, half-width, half-height
Y_SNOUT, Y_MOUTH, Y_TAIL = -0.53, -0.40, 0.84
KNOTS = [
    (-0.53, 0.0045, 0.0045), (-0.515, 0.024, 0.018), (-0.48, 0.042, 0.031), (-0.43, 0.056, 0.044),
    (-0.37, 0.056, 0.050), (-0.30, 0.052, 0.054), (-0.15, 0.060, 0.066), (0.05, 0.063, 0.069),
    (0.25, 0.055, 0.061), (0.45, 0.041, 0.051), (0.62, 0.028, 0.044), (0.76, 0.015, 0.036), (0.84, 0.0035, 0.028),
]
KY = np.array([k[0] for k in KNOTS])


def crom(vals, y):
    """Catmull-Rom through the knots (non-uniform spacing handled by a uniform parameter per segment)."""
    i = int(np.clip(np.searchsorted(KY, y) - 1, 0, len(KY) - 2))
    t = (y - KY[i]) / (KY[i + 1] - KY[i])
    p0, p1, p2, p3 = (vals[max(i - 1, 0)], vals[i], vals[i + 1], vals[min(i + 2, len(vals) - 1)])
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)


THICK = 1.7# the knots above are the lean shape; the body is a little stouter so it reads on a phone
RX = [k[1] for k in KNOTS]
RZ = [k[2] for k in KNOTS]


def prof(y):
    head = 1 + 0.5 * smoothstep(-0.27, -0.43, y)  # the head and jaw are 1.5x the lean profile (art review), blending into the neck
    rx = max(crom(RX, y) * THICK * head, 0.003)
    rz = max(crom(RZ, y) * THICK * head, 0.003)
    lift = 0.055 * max(0.0, min(1.0, (y - 0.33) / 0.5)) ** 1.5  # the tail rises off the ground
    zc = 0.004 + 0.82 * rz + lift
    return rx, rz, zc


N = 16
BODY_V = 0.76


def ring_pt(y, idx):
    rx, rz, zc = prof(y)
    th = 2 * math.pi * idx / N
    c = math.cos(th)
    z = zc - (0.82 * rz if c > 0 else rz) * c
    return Vector((rx * math.sin(th), y, z))


def uv_body(idx, y):
    s = (y - Y_SNOUT) / (Y_TAIL - Y_SNOUT)
    return (idx / N, BODY_V * (1 - s))


# ---- skin weights from position along the body
CHAIN = [("head", -0.419), ("neck", -0.361), ("spine4", -0.276), ("spine3", -0.196), ("spine2", -0.11),
         ("spine1", -0.01), ("spine0", 0.07), ("tail0", 0.13), ("tail1", 0.24), ("tail2", 0.36), ("tail3", 0.47)]


def chain_w(y):
    if y <= CHAIN[0][1]:
        return {"head": 1.0}
    if y >= CHAIN[-1][1]:
        return {"tail3": 1.0}
    for (a, ya), (b, yb) in zip(CHAIN, CHAIN[1:]):
        if ya <= y <= yb:
            t = (y - ya) / (yb - ya)
            return {a: 1 - t, b: t}


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def weights(y, jaw=False, bone=None):
    if bone:
        return {bone: 1.0}
    w = chain_w(y)
    if jaw:
        j = smoothstep(Y_MOUTH, Y_MOUTH - 0.07, y)
        w = {k: v * (1 - j) for k, v in w.items()}
        w["jaw"] = j
    return w


bm = bmesh.new()
uvl = bm.loops.layers.uv.verify()
dl = bm.verts.layers.deform.verify()


def vert(p, w):
    v = bm.verts.new(p)
    for k, x in w.items():
        if x > 1e-4:
            v[dl][gidx[k]] = x
    return v


def face(vs, uvs):
    try:
        f = bm.faces.new(vs)
    except ValueError:
        return None
    for l, uv in zip(f.loops, uvs):
        l[uvl].uv = uv
    return f


# ---- body rings
ys_body = list(np.linspace(Y_MOUTH, Y_TAIL, 76))
ys_body = [float(y) for y in ys_body]
body = []
for y in ys_body:
    body.append([vert(ring_pt(y, i), weights(y)) for i in range(N)])


def quad_ring(ra, rb, ya, yb, idxs, jaw_flag=None):
    """Quads between two rings (lists of verts keyed by position in idxs)."""
    for a in range(len(idxs) - 1):
        i0, i1 = idxs[a], idxs[a + 1]
        vs = [ra[a], rb[a], rb[a + 1], ra[a + 1]]
        uvs = [uv_body(i0, ya), uv_body(i0, yb), uv_body(i1, yb), uv_body(i1, ya)]
        face(vs, uvs)


for k in range(len(ys_body) - 1):
    ra = [body[k][i % N] for i in range(N + 1)]
    rb = [body[k + 1][i % N] for i in range(N + 1)]
    quad_ring(ra, rb, ys_body[k], ys_body[k + 1], list(range(N + 1)))
# tail tip cap: a pointed fan
tip = vert(Vector((0, Y_TAIL + 0.012, prof(Y_TAIL)[2] - 0.004)), weights(Y_TAIL))
last = body[-1]
for i in range(N):
    face([last[i], last[(i + 1) % N], tip], [uv_body(i, Y_TAIL), uv_body(i + 1, Y_TAIL), uv_body(i + 0.5, Y_TAIL + 0.012)])

# ---- head: upper and lower chains from the mouth ring towards the snout
M = 9
ys_head = [Y_MOUTH - (Y_MOUTH - Y_SNOUT) * (m / M) ** 0.9 for m in range(M + 1)]
UP = list(range(N // 4, 3 * N // 4 + 1))  # 4..12
LO = list(range(3 * N // 4, 5 * N // 4 + 1))  # 12..20
up_rings = [[body[0][i % N] for i in UP]]
lo_rings = [[body[0][i % N] for i in LO]]
for m in range(1, M + 1):
    y = ys_head[m]
    up_rings.append([vert(ring_pt(y, i), weights(y)) for i in UP])
    lo_rings.append([vert(ring_pt(y, i), weights(y, jaw=True)) for i in LO])
for m in range(M):
    quad_ring(up_rings[m], up_rings[m + 1], ys_head[m], ys_head[m + 1], UP)
    quad_ring(lo_rings[m], lo_rings[m + 1], ys_head[m], ys_head[m + 1], LO)
# snout caps (separate apexes so the jaw can open)
for rings, idxs, jaw in ((up_rings, UP, False), (lo_rings, LO, True)):
    ring = rings[-1]
    cx = sum(v.co.x for v in ring) / len(ring)
    cz = sum(v.co.z for v in ring) / len(ring)
    ap = vert(Vector((cx, Y_SNOUT - 0.012, cz)), weights(Y_SNOUT, jaw=jaw))
    for a in range(len(ring) - 1):
        face([ring[a], ring[a + 1], ap], [uv_body(idxs[a], Y_SNOUT), uv_body(idxs[a + 1], Y_SNOUT), uv_body((idxs[a] + idxs[a + 1]) / 2, Y_SNOUT - 0.012)])
    # close the chord (mouth line) so each half is a closed shell: a fan over the snout end
# palate and floor: strips across the mouth, the dark flesh swatch
MU = (0.60, 0.72)
for rings, flip in ((up_rings, False), (lo_rings, True)):
    for m in range(M):
        a0, a1 = rings[m][0], rings[m][-1]
        b0, b1 = rings[m + 1][0], rings[m + 1][-1]
        vs = [a0, a1, b1, b0] if not flip else [a1, a0, b0, b1]
        uvs = [(MU[0], 0.80), (MU[1], 0.80), (MU[1], 0.95), (MU[0], 0.95)]
        face(vs, uvs)

# ---- fins (ribbons, two-sided material)
FIN_U = (0.01, 0.34)


def fin_ribbon(ys, base_fn, dir_vec, h_fn, weight_bone=None, seed=1):
    r = random.Random(seed)
    rows = []
    for y in ys:
        b = base_fn(y)
        h = h_fn(y) * (0.65 + 0.35 * r.random())
        top = b + dir_vec * h
        w = weights(y, bone=weight_bone)
        rows.append((vert(b, w), vert(top, w), y))
    for (b0, t0, y0), (b1, t1, y1) in zip(rows, rows[1:]):
        v0 = 0.76 + 0.24 * (y0 + 0.5) / 1.4
        v1 = 0.76 + 0.24 * (y1 + 0.5) / 1.4
        face([b0, b1, t1, t0], [(FIN_U[0], v0), (FIN_U[0], v1), (FIN_U[1], v1), (FIN_U[1], v0)])


dorsal_ys = [float(y) for y in np.linspace(-0.30, Y_TAIL - 0.005, 90)]


def dorsal_base(y):
    rx, rz, zc = prof(y)
    return Vector((0, y, zc + rz - 0.004))


def dorsal_h(y):
    t = (y + 0.30) / (Y_TAIL + 0.30)
    h = 0.014 + 0.024 * math.sin(math.pi * min(1, t * 1.1)) ** 0.8
    notch = 0.35 if (0.40 < y < 0.46 or 0.10 < y < 0.14 or -0.12 < y < -0.09) else 1.0
    return h * notch * (1 - 0.7 * smoothstep(0.7, 0.84, y))


fin_ribbon(dorsal_ys, dorsal_base, Vector((0, 0, 1)), dorsal_h, seed=3)
anal_ys = [float(y) for y in np.linspace(0.30, Y_TAIL - 0.01, 50)]


def anal_base(y):
    rx, rz, zc = prof(y)
    return Vector((0, y, zc - 0.82 * rz + 0.004))


def anal_h(y):
    t = (y - 0.30) / (Y_TAIL - 0.30)
    return 0.035 * math.sin(math.pi * min(1, t * 1.05)) ** 0.7 * (1 - 0.6 * smoothstep(0.75, 0.84, y)) * (0.55 if 0.52 < y < 0.58 else 1.0)


fin_ribbon(anal_ys, anal_base, Vector((0, 0, -1)), anal_h, seed=5)

# pectoral fins behind the head
for side in (-1, 1):
    y0 = -0.325
    rx, rz, zc = prof(y0)
    p0 = Vector((side * (rx - 0.004), y0, zc + 0.005))
    pts = [p0, p0 + Vector((side * 0.05, 0.012, 0.012)), p0 + Vector((side * 0.075, 0.045, 0.004)), p0 + Vector((side * 0.052, 0.07, -0.004)), p0 + Vector((0.0, 0.05, -0.012))]
    w = weights(y0, bone="spine4")
    vs = [vert(p, w) for p in pts]
    uvc = [(0.01, 0.88), (0.30, 0.82), (0.34, 0.90), (0.30, 0.97), (0.01, 0.95)]
    for a in range(1, 4):
        face([vs[0], vs[a], vs[a + 1]] if side > 0 else [vs[0], vs[a + 1], vs[a]], [uvc[0], uvc[a], uvc[a + 1]])

# ---- teeth
TEETH_UV = (0.43, 0.88)
tips = {}


def cone(base, direction, length, radius, w, name=None, sides=4):
    d = direction.normalized()
    t = d.cross(Vector((1, 0, 0)))
    if t.length < 1e-3:
        t = d.cross(Vector((0, 1, 0)))
    t.normalize()
    b = d.cross(t)
    ring = [vert(base + t * math.cos(2 * math.pi * k / sides) * radius + b * math.sin(2 * math.pi * k / sides) * radius, w) for k in range(sides)]
    ap = vert(base + d * length, w)
    for k in range(sides):
        face([ring[k], ring[(k + 1) % sides], ap], [TEETH_UV, (TEETH_UV[0] + 0.004, TEETH_UV[1]), (TEETH_UV[0], TEETH_UV[1] + 0.05)])
    if name:
        tips[name] = [ap.co.x, ap.co.y, ap.co.z]


for m in range(0, M):
    for side, a in ((1, 0), (-1, -1)):
        for rings, jaw, down in ((up_rings, False, -1), (lo_rings, True, 1)):
            v0 = rings[m][a]
            v1 = rings[m + 1][a]
            p = (v0.co + v1.co) / 2
            y = p.y
            ln = 0.014 + 0.012 * (1 - m / M) + (0.012 if (m == 3 and not jaw) else 0)
            name = None
            if not jaw and m == 3:
                name = "upperL" if side > 0 else "upperR"
                ln += 0.012
            if jaw and m == 2 and side > 0:
                name = "lower"
            w = weights(y, jaw=jaw)
            cone(p + Vector((-side * 0.004, 0, -down * 0.002)), Vector((-side * 0.15, 0, down)), ln, 0.0032, w, name)
# front teeth on the snout
for rings, jaw, down in ((up_rings, False, -1), (lo_rings, True, 1)):
    ring = rings[-1]
    for k in (len(ring) // 2 - 1, len(ring) // 2 + 1):
        p = ring[k].co.copy()
        cone(p + Vector((0, 0.002, -down * 0.003)), Vector((0, -0.2, down)), 0.016, 0.003, weights(p.y, jaw=jaw))

# ---- eyes and nostril tubes
EYE_C = (0.53, 0.93)
for side in (-1, 1):
    y0 = -0.438
    rx, rz, zc = prof(y0)
    c = Vector((side * (rx * 0.82), y0, zc + rz * 0.36))
    R = 0.019
    res = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=7, radius=R)
    w = weights(y0, bone="head")
    for v in res["verts"]:
        d = v.co.copy()
        v.co = c + Vector((d.x * 0.7, d.y, d.z))
        for k, x in w.items():
            v[dl][gidx[k]] = x
    for f in {f for v in res["verts"] for f in v.link_faces}:
        for l in f.loops:
            d = l.vert.co - c
            l[uvl].uv = (EYE_C[0] - side * d.y / R * 0.028, EYE_C[1] + d.z / R * 0.028)
for side in (-1, 1):
    y0 = -0.512
    rx, rz, zc = prof(y0)
    cone(Vector((side * 0.011, y0, zc + rz * 0.5)), Vector((0, -0.4, 1)), 0.011, 0.0042, weights(y0, bone="head"), sides=5)

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.normal_update()
# verify winding on a body ring: the side face must point away from the axis
chk = body[len(body) // 2][N // 4]
print("NORMAL_OUTWARD", chk.normal.x > 0)

# the old mesh's geometry goes; its object, parent, modifier and vertex groups stay
mesh.clear_geometry()
bm.to_mesh(mesh)
bm.free()
# clear_geometry drops the group names stored on the mesh: put them back in the same index order so the deform indices still match
if len(obj.vertex_groups) != len(gidx):
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    for name, _ in sorted(gidx.items(), key=lambda kv: kv[1]):
        obj.vertex_groups.new(name=name)
    assert all(obj.vertex_groups[n].index == i for n, i in gidx.items())
print("GROUPS", len(obj.vertex_groups))
for p in mesh.polygons:
    p.use_smooth = True
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
try:
    bpy.ops.mesh.customdata_custom_splitnormals_clear()
except Exception as e:
    print("splitnormals", e)

# ---- material
mat = bpy.data.materials.new("Slick scarred eel skin")
mesh.materials.clear()
mesh.materials.append(mat)
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


alb = img("eel-albedo", D + "albedo.png", "sRGB")
orm = img("eel-orm", D + "orm.png", "Non-Color")
nrm = img("eel-normal", D + "normal.png", "Non-Color")
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

tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
print("TRIS", tris, "VERTS", len(mesh.vertices))
json.dump(tips, open(D + "tips.json", "w"))
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", export_animations=True, export_animation_mode="ACTIONS",
    export_image_format="WEBP", export_image_quality=78, export_apply=False, export_yup=True,
)
print("EXPORTED", OUT)
