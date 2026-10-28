"""Elephant colour and emissive atlas (CPU: numpy + Pillow). Every texel is coloured from the 3D rest-pose position and the body part of the
triangle that covers it, so seams never show. Ash-grey warm hide with creased rings, pale ash dusting, healed scars, raw glowing wounds, yellowed
broken tusks, bone spurs and ember-red eyes and lumps.
Run: python3 elephant_tex.py elephant_mesh.npz out_colour.png out_emissive.png [size]"""
import sys
import numpy as np
from PIL import Image

NPZ, OUT_C, OUT_E = sys.argv[1], sys.argv[2], sys.argv[3]
S = int(sys.argv[4]) if len(sys.argv) > 4 else 512
d = np.load(NPZ)
pos, nor, uv, part, tris = d["pos"], d["nor"], d["uv"], d["part"], d["tris"]
PARTS = [str(p) for p in d["parts"]]
PID = {n: i for i, n in enumerate(PARTS)}

# ---------------------------------------------------------------- rasterise position / normal / part into the atlas
P = np.zeros((S, S, 3), np.float32)
Nn = np.zeros((S, S, 3), np.float32)
PT = np.full((S, S), -1, np.int32)
for t in tris:
    a, b, c = t
    pa = np.array([uv[a][0] * S, uv[a][1] * S])
    pb = np.array([uv[b][0] * S, uv[b][1] * S])
    pc = np.array([uv[c][0] * S, uv[c][1] * S])
    x0, x1 = int(max(0, np.floor(min(pa[0], pb[0], pc[0]) - 1))), int(min(S - 1, np.ceil(max(pa[0], pb[0], pc[0]) + 1)))
    y0, y1 = int(max(0, np.floor(min(pa[1], pb[1], pc[1]) - 1))), int(min(S - 1, np.ceil(max(pa[1], pb[1], pc[1]) + 1)))
    if x1 < x0 or y1 < y0:
        continue
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    den = (pb[1] - pc[1]) * (pa[0] - pc[0]) + (pc[0] - pb[0]) * (pa[1] - pc[1])
    if abs(den) < 1e-9:
        continue
    w0 = ((pb[1] - pc[1]) * (gx - pc[0]) + (pc[0] - pb[0]) * (gy - pc[1])) / den
    w1 = ((pc[1] - pa[1]) * (gx - pc[0]) + (pa[0] - pc[0]) * (gy - pc[1])) / den
    w2 = 1 - w0 - w1
    eps = 0.04
    m = (w0 >= -eps) & (w1 >= -eps) & (w2 >= -eps)
    if not m.any():
        continue
    sl = (slice(y0, y1 + 1), slice(x0, x1 + 1))
    W0, W1, W2 = w0[m][:, None], w1[m][:, None], w2[m][:, None]
    P[sl][m] = W0 * pos[a] + W1 * pos[b] + W2 * pos[c]
    Nn[sl][m] = W0 * nor[a] + W1 * nor[b] + W2 * nor[c]
    PT[sl][m] = part[a]
filled = PT >= 0
# dilate four texels so bilinear filtering and mips never pull in empty texels
for _ in range(4):
    grow = ~filled
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        src = np.roll(np.roll(filled, dy, 0), dx, 1)
        take = grow & src
        if not take.any():
            continue
        for arr in (P, Nn):
            arr[take] = np.roll(np.roll(arr, dy, 0), dx, 1)[take]
        PT[take] = np.roll(np.roll(PT, dy, 0), dx, 1)[take]
        filled = filled | take
        grow = ~filled
Nl = np.linalg.norm(Nn, axis=-1, keepdims=True)
Nn = Nn / np.maximum(Nl, 1e-6)

# glTF space -> rig names: lat = x, h = y (up), fwd = z
lat, h, fwd = P[..., 0], P[..., 1], P[..., 2]


# ---------------------------------------------------------------- noise
def hash3(ix, iy, iz, seed=0):
    n = (ix.astype(np.int64) * 73856093) ^ (iy.astype(np.int64) * 19349663) ^ (iz.astype(np.int64) * 83492791) ^ (seed * 2654435761)
    n = (n ^ (n >> 13)) * 1274126177
    n = n ^ (n >> 16)
    return (n & 0xFFFFFF).astype(np.float32) / float(0x1000000)


def vnoise(x, y, z, f, seed=0):
    x, y, z = x * f, y * f, z * f
    ix, iy, iz = np.floor(x), np.floor(y), np.floor(z)
    fx, fy, fz = x - ix, y - iy, z - iz
    fx, fy, fz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                wgt = (fx if dx else 1 - fx) * (fy if dy else 1 - fy) * (fz if dz else 1 - fz)
                out = out + wgt * hash3(ix + dx, iy + dy, iz + dz, seed)
    return out


def fbm(f, seed=0, oct=3):
    a, tot, amp = 0, 0, 1.0
    for o in range(oct):
        a = a + amp * vnoise(lat, h, fwd, f * (2 ** o), seed + o)
        tot += amp
        amp *= 0.5
    return a / tot


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    return a * (1 - t[..., None]) + b * t[..., None]


def col(r, g, b):
    return np.array([r, g, b], np.float32)


# ---------------------------------------------------------------- the hide
is_ = lambda *names: np.isin(PT, [PID[n] for n in names])
base = np.zeros((S, S, 3), np.float32) + col(0.4, 0.355, 0.315)
mott = fbm(9, 1)
base = base * (0.78 + 0.5 * mott)[..., None]
# creases: ridged noise darkens a network of folds; rings on legs and trunk
ridge = 1 - np.abs(2 * fbm(16, 5) - 1)
fold = smooth(0.78, 0.97, ridge)
rings = np.sin(h * 190 + 3 * fbm(8, 9)) * 0.5 + 0.5
ringline = smooth(0.82, 1.0, 1 - rings)
limb = is_("leg", "trunk")
dark = 1 - 0.26 * fold - 0.3 * ringline * limb
base = base * dark[..., None]
# pale ash dust on the top surfaces; soot on the belly and the legs' lower halves
up = np.clip(Nn[..., 1], 0, 1)
dust = smooth(0.35, 0.8, fbm(11, 12)) * smooth(0.2, 0.9, up) * smooth(0.28, 0.52, h) * 0.65
base = mix(base, col(0.66, 0.64, 0.6), dust)
soot = smooth(0.34, 0.1, h) * 0.55 + smooth(0.6, 0.95, 1 - up) * 0.15
base = mix(base, col(0.1, 0.09, 0.085), soot * smooth(0.3, 0.6, fbm(6, 14)))
# sparse bright ash flecks
fleck = smooth(0.86, 0.93, vnoise(lat, h, fwd, 140, 21))
base = mix(base, col(0.8, 0.78, 0.74), fleck * 0.7 * (1 - limb))

# ---------------------------------------------------------------- scars and wounds (pale healed bands, raw glowing gashes, burns)
emi = np.zeros((S, S, 3), np.float32)


def seg_dist(p, a, b):
    a, b = np.array(a, np.float32), np.array(b, np.float32)
    ab = b - a
    t = np.clip(((p - a) @ ab) / float(ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[..., None] * ab), axis=-1)


pts = np.stack([lat, h, fwd], -1)
SLASHES = [  # (a, b, width) in glTF rig space; z is forward
    ((0.15, 0.50, 0.12), (0.15, 0.30, -0.02), 0.011),
    ((0.14, 0.5, -0.06), (0.15, 0.3, -0.16), 0.01),
    ((-0.15, 0.48, 0.02), (-0.16, 0.3, 0.14), 0.011),
    ((-0.15, 0.52, -0.12), (-0.15, 0.31, -0.02), 0.009),
    ((0.05, 0.52, 0.14), (0.14, 0.4, 0.1), 0.008),
    ((0.03, 0.4, 0.5), (0.03, 0.18, 0.545), 0.008),  # trunk
    ((0.09, 0.22, 0.19), (0.09, 0.04, 0.2), 0.008),  # front leg
]
scar = np.zeros((S, S), np.float32)
raw = np.zeros((S, S), np.float32)
for i, (a, b, wd) in enumerate(SLASHES):
    dd = seg_dist(pts, a, b)
    jag = 1 + 0.5 * (vnoise(lat, h, fwd, 90, 30 + i) - 0.5)
    scar = np.maximum(scar, smooth(wd * 1.5 * jag, wd * 0.5, dd))
    raw = np.maximum(raw, smooth(wd * 0.45 * jag, wd * 0.1, dd) * (vnoise(lat, h, fwd, 25, 40 + i) > 0.45))
scar *= ~is_("tusk", "eye", "nail", "spur")
raw *= ~is_("tusk", "eye", "nail", "spur")
base = mix(base, col(0.66, 0.5, 0.46), scar * 0.9)
base = mix(base, col(0.34, 0.14, 0.12), raw)  # old open wounds: dull dried red-brown, nothing glows (28 Oct, realistic look)
# burns: charred blotches
burn = smooth(0.74, 0.8, fbm(5, 50)) * smooth(0.45, 0.6, h) * (1 - limb)
base = mix(base, col(0.08, 0.07, 0.065), burn * 0.85)

# ---------------------------------------------------------------- parts
# ears: pink-grey inner face with a dark vein web; the rim torn pale
ear = is_("ear")
front = np.clip(Nn[..., 2], -1, 1)
veins = smooth(0.8, 0.95, 1 - np.abs(2 * vnoise(lat, h, fwd, 38, 61) - 1))
einner = mix(base, col(0.52, 0.4, 0.38), np.full((S, S), 0.5, np.float32))
einner = mix(einner, col(0.3, 0.1, 0.1), veins * 0.7)
rim = smooth(0.12, 0.0, 0.0 + np.abs(vnoise(lat, h, fwd, 60, 62) - 0.5))  # ragged darker patches along the torn edge
base = np.where(ear[..., None], np.where((front > 0)[..., None], einner, base * 0.92), base)
base = np.where(ear[..., None], mix(base, col(0.2, 0.16, 0.14), rim * 0.5), base)
# tusks: yellowed bone, brown stain toward the root, dark cracks; blunt snapped ends
tusk = is_("tusk")
tc = mix(np.zeros((S, S, 3), np.float32) + col(0.78, 0.7, 0.5), col(0.3, 0.21, 0.13), 1 - smooth(0.44, 0.54, fwd))
tc = tc * (0.8 + 0.3 * vnoise(lat, h, fwd, 120, 70))[..., None]
tc = mix(tc, col(0.18, 0.12, 0.08), smooth(0.86, 0.97, 1 - np.abs(2 * vnoise(lat, h, fwd, 160, 71) - 1)) * 0.8)
base = np.where(tusk[..., None], tc, base)
# bone spurs on the back: pale shafts, dark and wet at the root
spur = is_("spur")
sc = mix(np.zeros((S, S, 3), np.float32) + col(0.2, 0.12, 0.1), col(0.74, 0.68, 0.54), smooth(0.5, 0.58, h))
sc = sc * (0.85 + 0.25 * vnoise(lat, h, fwd, 150, 72))[..., None]
base = np.where(spur[..., None], sc, base)
# lumps: raw, mottled red growths that glow like embers
lump = is_("lump")
lm = 0.5 + 0.5 * vnoise(lat, h, fwd, 80, 73)
lc = mix(np.zeros((S, S, 3), np.float32) + col(0.36, 0.25, 0.23), col(0.5, 0.34, 0.3), lm)  # scar-tissue growths, no glow
base = np.where(lump[..., None], lc, base)
# eyes, lips, feet, nails, tail
eye = is_("eye")
base = np.where(eye[..., None], col(0.05, 0.04, 0.035), base)  # ordinary small dark eyes
base = np.where(is_("jaw")[..., None], col(0.26, 0.09, 0.09) * (0.8 + 0.4 * mott)[..., None], base)
base = np.where(is_("foot")[..., None], base * 0.7, base)
base = np.where(is_("nail")[..., None], col(0.62, 0.56, 0.45) * (0.8 + 0.3 * mott)[..., None], base)
base = np.where(is_("tail")[..., None], base * 0.8, base)
base = np.where(is_("tuft")[..., None], col(0.13, 0.115, 0.1) * (0.7 + 0.6 * mott)[..., None], base)
# a touch of ambient shading: the underside and the crevice between legs read darker
ao = 0.72 + 0.28 * smooth(-0.6, 0.6, Nn[..., 1])
base = base * ao[..., None]

img = (np.clip(base, 0, 1) ** 1.0 * 255).astype(np.uint8)
Image.fromarray(img).save(OUT_C)
Image.fromarray((np.clip(emi, 0, 1) * 255).astype(np.uint8)).save(OUT_E)
print("TEX", S, "filled", float(filled.mean()))
