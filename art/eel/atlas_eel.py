"""Eel textures (CPU, numpy/scipy/Pillow): albedo 1024, ORM 512, normal 512, all painted here, no source image.
Layout (u right, v up; rows of the PNG are top-down):
  body strip   v 0.00..0.76  u 0..1 around the body (u=0 and 1 is the belly centre, u=0.5 the spine), v falls from head (0.76) to tail tip (0)
  swatches     v 0.76..1.00  fins (u 0..0.35), teeth (0.40..0.46), eye (0.50..0.56), mouth (0.60..0.72)
build_eel.py uses the same constants (SWATCH, BODY_V) so the UVs land on these cells.
Run: python3 atlas_eel.py <outdir>"""
import sys, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
W = H = 1024
BODY_V = 0.76
rng = np.random.default_rng(2810)


def tile_noise(h, w, sigma, seed):
    """Periodic noise in both axes: white noise blurred with a wrapping gaussian, then normalised to 0..1."""
    r = np.random.default_rng(seed)
    n = ndimage.gaussian_filter(r.standard_normal((h, w)), sigma=sigma, mode="wrap")
    n -= n.min()
    return n / max(n.max(), 1e-6)


def smooth(a, lo, hi):
    t = np.clip((a - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    return a + (b - a) * t[..., None]


yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
U = (xx + 0.5) / W
V = 1.0 - (yy + 0.5) / H  # v up
in_body = V < BODY_V
S = np.clip((BODY_V - V) / BODY_V, 0, 1)  # 0 at the head, 1 at the tail tip
dorsal = (1 - np.cos(2 * np.pi * U)) / 2  # 0 at the belly centre, 1 on the spine

belly = np.array([0.80, 0.66, 0.42])
flank = np.array([0.22, 0.15, 0.075])
back = np.array([0.065, 0.050, 0.036])
back_hi = np.array([0.130, 0.095, 0.060])

n_big = tile_noise(H, W, 26, 1)
n_mid = tile_noise(H, W, 9, 2)
n_fine = tile_noise(H, W, 2.2, 3)
blot = tile_noise(H, W, 14, 4)

t_flank = smooth(dorsal, 0.10, 0.34)
t_back = smooth(dorsal, 0.52, 0.88)
col = mix(np.broadcast_to(belly, (H, W, 3)).copy(), np.broadcast_to(flank, (H, W, 3)).copy(), t_flank)
col = mix(col, np.broadcast_to(back, (H, W, 3)).copy(), t_back)
# mottling: lighter olive patches on the flanks, dark patches on the back
patch = smooth(blot, 0.52, 0.72)
col = mix(col, np.broadcast_to(back_hi, (H, W, 3)).copy(), patch * smooth(dorsal, 0.3, 0.9) * 0.55)
col *= (0.82 + 0.36 * n_mid)[..., None]
col *= (0.94 + 0.12 * n_fine)[..., None]
# the head is slightly paler and greener, the tail darker
col = mix(col, col * np.array([1.0, 0.95, 0.9]), smooth(0.2 - S, 0, 0.2))
col *= (1.0 - 0.25 * smooth(S, 0.75, 1.0))[..., None]

# a pale lateral stripe along each flank so the long body separates from dark paving
stripe = np.exp(-((dorsal - 0.40) / 0.07) ** 2) * (0.75 + 0.25 * n_mid)
col = mix(col, np.broadcast_to(np.array([0.70, 0.52, 0.28]), (H, W, 3)).copy(), np.clip(stripe, 0, 1) * 0.55)
# head: a pale jaw line along the mouth, a pale lower jaw, so the head reads at phone size
head_zone = smooth(0.24 - S, 0.0, 0.06)
lip = np.exp(-((dorsal - 0.5) / 0.045) ** 2)
col = mix(col, np.broadcast_to(np.array([0.92, 0.80, 0.52]), (H, W, 3)).copy(), np.clip(lip * head_zone, 0, 1) * 0.5)
col = mix(col, np.broadcast_to(np.array([0.60, 0.50, 0.36]), (H, W, 3)).copy(), (dorsal < 0.46) * head_zone * 0.5)
# lateral line: a row of pale pores along each flank
line = np.abs(dorsal - 0.5)
pores = (line < 0.012) & (np.sin(S * 520) > 0.2)
col = mix(col, np.broadcast_to(np.array([0.62, 0.55, 0.34]), (H, W, 3)).copy(), pores.astype(np.float32) * 0.8)

# scars and wounds, drawn on a mask at 2x and wrapped in u
SC = 2
scar = Image.new("L", (W * SC, H * SC), 0)
rim = Image.new("L", (W * SC, H * SC), 0)
ds, dr = ImageDraw.Draw(scar), ImageDraw.Draw(rim)


def line_wrapped(d, pts, width):
    for dx in (-W * SC, 0, W * SC):
        d.line([(x + dx, y) for x, y in pts], fill=255, width=width)


def px(u, s):
    return (u * W * SC, (1 - BODY_V * (1 - s)) * H * SC)


# long gashes running slantwise across the flank and back
for i in range(11):
    u0 = rng.uniform(0.18, 0.82)
    s0 = rng.uniform(0.12, 0.92)
    ang = rng.uniform(-0.9, 0.9)
    ln = rng.uniform(0.05, 0.16)
    pts = []
    for k in range(7):
        t = k / 6
        pts.append(px(u0 + np.sin(ang) * ln * t * 0.9 + rng.normal(0, 0.003), min(0.99, s0 + np.cos(ang) * ln * t * 0.6 + rng.normal(0, 0.002))))
    line_wrapped(dr, pts, 9 * SC)
    line_wrapped(ds, pts, 4 * SC)
# bite scars: two arcs of puncture marks
for (u0, s0) in ((0.30, 0.34), (0.66, 0.55), (0.42, 0.78)):
    for k in range(5):
        a = -0.8 + 0.4 * k
        for sgn in (-1, 1):
            cx, cy = px(u0 + 0.045 * np.sin(a), s0 + sgn * 0.035 * np.cos(a) * 0.5 + 0.0)
            r = 3.5 * SC
            dr.ellipse([cx - r * 2, cy - r * 2, cx + r * 2, cy + r * 2], fill=255)
            ds.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
# a healed harpoon ring on the flank
for (u0, s0) in ((0.25, 0.46), (0.74, 0.28)):
    cx, cy = px(u0, s0)
    for r, w in ((20 * SC, 5 * SC), (11 * SC, 4 * SC)):
        dr.ellipse([cx - r - w, cy - r - w, cx + r + w, cy + r + w], outline=255, width=w + 4)
        ds.ellipse([cx - r, cy - r, cx + r, cy + r], outline=255, width=w)

sm = np.asarray(scar.resize((W, H), Image.LANCZOS), np.float32) / 255
rm = np.asarray(rim.resize((W, H), Image.LANCZOS), np.float32) / 255
sm = ndimage.gaussian_filter(sm, 0.8, mode="wrap") * (0.75 + 0.25 * n_fine)
rm = ndimage.gaussian_filter(rm, 1.4, mode="wrap")
scar_col = np.array([0.74, 0.60, 0.50])
col = mix(col, col * 0.55, np.clip(rm - sm, 0, 1))
col = mix(col, np.broadcast_to(scar_col, (H, W, 3)).copy(), np.clip(sm * 1.1, 0, 1))
scar_mask = np.clip(sm * 1.1, 0, 1)

# swatches in the top band: v 0.76..1.00
def cell(u0, u1, v0, v1):
    x0, x1 = int(u0 * W), int(u1 * W)
    y0, y1 = int((1 - v1) * H), int((1 - v0) * H)
    return x0, x1, y0, y1


img = col.copy()
gloss = np.where(in_body, 0.07 + 0.22 * (1 - dorsal), 0.5).astype(np.float32)  # wet: low roughness on the back, a little higher on the belly
gloss += (n_fine - 0.5) * 0.14
gloss = np.where(in_body, gloss + scar_mask * 0.3, gloss)
height = (n_fine - 0.5) * 0.5 + (n_mid - 0.5) * 0.3
height = height - rm * 0.4 + sm * 0.6
height = np.where(pores, height - 0.5, height)

# fins (u 0..0.35, v 0.76..1.0): base dark skin at u=0, translucent amber at the edge, rays across the length
x0, x1, y0, y1 = cell(0.0, 0.35, BODY_V, 1.0)
fw, fh = x1 - x0, y1 - y0
fu = np.linspace(0, 1, fw)[None, :].repeat(fh, 0)
fv = np.linspace(0, 1, fh)[:, None].repeat(fw, 1)
rays = 0.5 + 0.5 * np.sin(fv * 2 * np.pi * 46 + 3 * tile_noise(fh, fw, 6, 9))
fin_base = np.array([0.07, 0.06, 0.04])
fin_edge = np.array([0.52, 0.38, 0.17])
fc = mix(np.broadcast_to(fin_base, (fh, fw, 3)).copy(), np.broadcast_to(fin_edge, (fh, fw, 3)).copy(), smooth(fu, 0.1, 1.0) * (0.55 + 0.45 * rays))
img[y0:y1, x0:x1] = fc
gloss[y0:y1, x0:x1] = 0.5
height[y0:y1, x0:x1] = (rays - 0.5) * 0.4

# teeth
x0, x1, y0, y1 = cell(0.40, 0.46, BODY_V, 1.0)
tv = np.linspace(0, 1, y1 - y0)[:, None].repeat(x1 - x0, 1)
img[y0:y1, x0:x1] = mix(np.broadcast_to(np.array([0.86, 0.80, 0.62]), (y1 - y0, x1 - x0, 3)).copy(), np.broadcast_to(np.array([0.55, 0.42, 0.24]), (y1 - y0, x1 - x0, 3)).copy(), smooth(tv, 0.55, 1.0))
gloss[y0:y1, x0:x1] = 0.38
height[y0:y1, x0:x1] = 0

# eye: amber iris with a slit pupil, a pale wet highlight ring
x0, x1, y0, y1 = cell(0.50, 0.56, 0.90, 0.96)
ew, eh = x1 - x0, y1 - y0
ey, ex = np.mgrid[0:eh, 0:ew].astype(np.float32)
ex = (ex / ew - 0.5) * 2
ey = (ey / eh - 0.5) * 2
r = np.hypot(ex, ey)
# realistic eel eye (2030 realism ruling): small, dark brown, round black pupil, no glow
eye = np.broadcast_to(np.array([0.07, 0.045, 0.03]), (eh, ew, 3)).copy()
eye = mix(eye, np.broadcast_to(np.array([0.02, 0.015, 0.012]), (eh, ew, 3)).copy(), smooth(r, 0.45, 1.0))
eye[r < 0.38] = (0.005, 0.005, 0.005)
img[y0:y1, x0:x1] = eye
gloss[y0:y1, x0:x1] = 0.06
height[y0:y1, x0:x1] = 0

# mouth: wet raw flesh
x0, x1, y0, y1 = cell(0.60, 0.72, BODY_V, 1.0)
mh, mw = y1 - y0, x1 - x0
mn = tile_noise(mh, mw, 5, 11)
mouth = mix(np.broadcast_to(np.array([0.42, 0.10, 0.09]), (mh, mw, 3)).copy(), np.broadcast_to(np.array([0.20, 0.04, 0.05]), (mh, mw, 3)).copy(), mn)
img[y0:y1, x0:x1] = mouth
gloss[y0:y1, x0:x1] = 0.12
height[y0:y1, x0:x1] = (mn - 0.5) * 0.4

img = np.clip(img, 0, 1)
Image.fromarray((np.power(img, 1 / 2.2) * 255).astype(np.uint8)).save(os.path.join(OUT, "albedo.png"))  # sRGB-encode the painted linear colours

# ORM 512
ao = np.ones((H, W), np.float32)
ao = ao - 0.35 * rm * 0.4 - 0.15 * (1 - dorsal) * in_body
orm = np.stack([np.clip(ao, 0, 1), np.clip(gloss, 0.05, 1), np.zeros((H, W), np.float32)], -1)
Image.fromarray((orm * 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "orm.png"))

# normal 512 from the height field (Sobel, wrapping in u)
hs = np.asarray(Image.fromarray(((height - height.min()) / (np.ptp(height) + 1e-6) * 65535).astype(np.uint16)).resize((512, 512), Image.LANCZOS), np.float32) / 65535
gx = ndimage.sobel(hs, axis=1, mode="wrap")
gy = ndimage.sobel(hs, axis=0, mode="nearest")
k = 5.0
n = np.stack([-gx * k, gy * k, np.ones_like(hs)], -1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(os.path.join(OUT, "normal.png"))
print("textures written to", OUT)
