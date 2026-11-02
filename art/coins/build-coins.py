"""Gold cash-drop coins (option 1 of the Cash Drop Looks page): a single coin, a small pile, a tall boss stack.
Pure Python, no dependencies, no textures: vertex-coloured flat-shaded meshes, one PBR material, so each GLB is a few KB.
Run: python3 build-coins.py <out dir>. Units metres, origin at ground centre, +Y up."""
import json, math, random, struct, sys

OUT = sys.argv[1]
SEG = 12
R, H = 0.13, 0.028          # one coin: radius, thickness (metres)
RIM_W, RIM_H = 0.022, 0.006  # raised rim width and height
EDGE = (0.62, 0.40, 0.04)    # milled edge
RIM = (0.93, 0.66, 0.10)     # rim and face highlight
FACE = (0.80, 0.54, 0.06)    # recessed face
EMBOSS = (0.69, 0.45, 0.05)  # inner ring


def lin(c):
    return tuple(round(v ** 2.2, 4) for v in c)  # glTF vertex colours are linear


class Mesh:
    def __init__(self):
        self.pos, self.nrm, self.col, self.idx = [], [], [], []

    def tri(self, a, b, c, color):
        ux, uy, uz = (b[i] - a[i] for i in range(3))
        vx, vy, vz = (c[i] - a[i] for i in range(3))
        n = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
        ln = math.sqrt(sum(x * x for x in n)) or 1.0
        n = tuple(x / ln for x in n)
        base = len(self.pos)
        for p in (a, b, c):
            self.pos.append(p)
            self.nrm.append(n)
            self.col.append(lin(color))
        self.idx += [base, base + 1, base + 2]

    def quad(self, a, b, c, d, color):
        self.tri(a, b, c, color)
        self.tri(a, c, d, color)

    def coin(self, cx, cy, cz, tilt=(0.0, 0.0), spin=0.0, scale=1.0, buried=False):
        """Coin centred at the base point (cx, cy, cz), flat on its back unless tilted (rotation about X then Z).
        buried=True (covered by the coin above) draws only the milled edge and a flat rim-coloured top: no stamp, no underside."""
        tx, tz = tilt
        sx, cxr = math.sin(tx), math.cos(tx)
        sz, czr = math.sin(tz), math.cos(tz)
        sp, cp = math.sin(spin), math.cos(spin)

        def xf(x, y, z):
            x, z = x * cp - z * sp, x * sp + z * cp
            y, z = y * cxr - z * sx, y * sx + z * cxr
            x, y = x * czr - y * sz, x * sz + y * czr
            return (cx + x * scale, cy + y * scale, cz + z * scale)

        ring = [(math.cos(2 * math.pi * i / SEG), math.sin(2 * math.pi * i / SEG)) for i in range(SEG)]
        r_out, r_in, r_emb = R, R - RIM_W, R * 0.52
        y0, y1, y_face = 0.0, H, H - RIM_H

        for i in range(SEG):
            a, b = ring[i], ring[(i + 1) % SEG]
            # milled edge (side wall)
            self.quad(xf(a[0] * r_out, y0, a[1] * r_out), xf(b[0] * r_out, y0, b[1] * r_out),
                      xf(b[0] * r_out, y1, b[1] * r_out), xf(a[0] * r_out, y1, a[1] * r_out), EDGE)
            if buried:
                self.tri(xf(0, y1, 0), xf(b[0] * r_out, y1, b[1] * r_out), xf(a[0] * r_out, y1, a[1] * r_out), RIM)
                continue
            # rim top
            self.quad(xf(a[0] * r_out, y1, a[1] * r_out), xf(b[0] * r_out, y1, b[1] * r_out),
                      xf(b[0] * r_in, y1, b[1] * r_in), xf(a[0] * r_in, y1, a[1] * r_in), RIM)
            # inner wall of the rim, down to the recessed face
            self.quad(xf(a[0] * r_in, y1, a[1] * r_in), xf(b[0] * r_in, y1, b[1] * r_in),
                      xf(b[0] * r_in, y_face, b[1] * r_in), xf(a[0] * r_in, y_face, a[1] * r_in), EDGE)
            # recessed face with a raised inner ring (the stamp)
            self.quad(xf(a[0] * r_in, y_face, a[1] * r_in), xf(b[0] * r_in, y_face, b[1] * r_in),
                      xf(b[0] * r_emb, y_face, b[1] * r_emb), xf(a[0] * r_emb, y_face, a[1] * r_emb), FACE)
            self.tri(xf(0, y_face + 0.003, 0), xf(a[0] * r_emb, y_face + 0.003, a[1] * r_emb),
                     xf(b[0] * r_emb, y_face + 0.003, b[1] * r_emb), EMBOSS)
            # underside
            self.tri(xf(0, y0, 0), xf(b[0] * r_out, y0, b[1] * r_out), xf(a[0] * r_out, y0, a[1] * r_out), EDGE)


def single():
    m = Mesh()
    m.coin(0, 0.0, 0, tilt=(math.radians(-8), 0), spin=0.3)  # lies almost flat, slight tilt so the face catches light
    return m


def pile():
    m = Mesh()
    for i in range(4):  # four-coin stack, slightly misaligned
        m.coin(0.01 * math.sin(i * 2.1), i * H, 0.012 * math.cos(i * 1.7), spin=i * 0.7, buried=i < 3)
    m.coin(0.27, 0.0, 0.05, tilt=(0, 0), spin=1.1)
    m.coin(0.2, 0.0, -0.22, tilt=(0, 0), spin=2.2)
    m.coin(-0.2, 0.0, -0.17, tilt=(0, 0), spin=0.4)
    m.coin(0.12, 0.0, 0.28, tilt=(0, 0), spin=3.0)
    return m


def stack():
    m = Mesh()
    rnd = random.Random(2810)
    for i in range(16):  # tall wobbling column
        m.coin(0.012 * math.sin(i * 1.3) + rnd.uniform(-0.006, 0.006), i * H,
               0.012 * math.cos(i * 0.9) + rnd.uniform(-0.006, 0.006), spin=rnd.uniform(0, 6.28), buried=i < 15)
    for j, (x, z, n) in enumerate([(0.3, 0.12, 3), (-0.28, 0.1, 2), (0.05, -0.31, 3)]):
        for i in range(n):
            m.coin(x + 0.008 * i, i * H, z, spin=j * 1.3 + i, buried=i < n - 1)
    return m


def write_glb(mesh, name, path):
    pos = b"".join(struct.pack("<3f", *p) for p in mesh.pos)
    nrm = b"".join(struct.pack("<3f", *n) for n in mesh.nrm)
    col = b"".join(struct.pack("<3f", *c) for c in mesh.col)
    idx = b"".join(struct.pack("<H", i) for i in mesh.idx)
    if len(mesh.pos) > 65535:
        raise SystemExit("too many vertices for uint16")
    idx += b"\0" * (-len(idx) % 4)
    blob = pos + nrm + col + idx
    n = len(mesh.pos)
    mins = [min(p[i] for p in mesh.pos) for i in range(3)]
    maxs = [max(p[i] for p in mesh.pos) for i in range(3)]
    gltf = {
        "asset": {"version": "2.0", "generator": "art/coins/build-coins.py"},
        "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"name": name, "mesh": 0}],
        "meshes": [{"name": name, "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "COLOR_0": 2}, "indices": 3, "material": 0}]}],
        "materials": [{"name": "Gold coin", "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0.85, "roughnessFactor": 0.42}}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": n, "type": "VEC3", "min": mins, "max": maxs},
            {"bufferView": 1, "componentType": 5126, "count": n, "type": "VEC3"},
            {"bufferView": 2, "componentType": 5126, "count": n, "type": "VEC3"},
            {"bufferView": 3, "componentType": 5123, "count": len(mesh.idx), "type": "SCALAR"},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(pos), "target": 34962},
            {"buffer": 0, "byteOffset": len(pos), "byteLength": len(nrm), "target": 34962},
            {"buffer": 0, "byteOffset": len(pos) + len(nrm), "byteLength": len(col), "target": 34962},
            {"buffer": 0, "byteOffset": len(pos) + len(nrm) + len(col), "byteLength": len(mesh.idx) * 2, "target": 34963},
        ],
        "buffers": [{"byteLength": len(blob)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(js), b"JSON") + js)
        f.write(struct.pack("<I4s", len(blob), b"BIN\0") + blob)
    print(name, len(mesh.idx) // 3, "tris", total, "bytes", [round(v, 3) for v in mins], [round(v, 3) for v in maxs])


write_glb(single(), "CashCoin", OUT + "/cash-coin.glb")
write_glb(pile(), "CashPile", OUT + "/cash-pile.glb")
write_glb(stack(), "CashStack", OUT + "/cash-stack.glb")
