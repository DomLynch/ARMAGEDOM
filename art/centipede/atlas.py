"""Centipede texture atlas (CPU, numpy + Pillow): albedo 1024x512, ORM 512x256, normal 512x256.

Image layout (x right, y down, pixels of the 1024x512 albedo):
  shell   x   0..512  y   0..160   u = around the body (0 and 1 are the belly line, 0.5 the dorsal ridge), v = one plate front to back
  legs    x 512..1024 y   0..128   u = around the leg, v = root to tip
  head    x 512..1024 y 128..320   top-down plate of the head
  pincer  x 512..768  y 320..448   v = base to tip
  antenna x 768..1024 y 320..384   v = base to tip
Run: python3 atlas.py OUTDIR
"""
import sys
import numpy as np
from PIL import Image

OUT = sys.argv[-1].rstrip("/") + "/"
W, H = 1024, 512
rng = np.random.default_rng(2810)

SHELL = (0, 0, 512, 160)
LEGS = (512, 0, 512, 128)
HEAD = (512, 128, 512, 192)
PINCER = (512, 320, 256, 128)
ANT = (768, 320, 256, 64)


def noise(h, w, scales=(4, 8, 16, 32, 64), amps=(1.0, 0.6, 0.35, 0.2, 0.12), seed=0):
    r = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    for s, a in zip(scales, amps):
        gh, gw = max(2, h * s // 256 + 2), max(2, w * s // 256 + 2)
        g = r.random((gh, gw)).astype(np.float32)
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        out += a * (np.asarray(im, np.float32) / 255.0 - 0.5)
    return out / sum(amps)


def mix(a, b, t):
    t = np.clip(t, 0, 1)[..., None]
    return np.array(a, np.float32) * (1 - t) + np.array(b, np.float32) * t


albedo = np.zeros((H, W, 3), np.float32)
albedo[:] = (30, 10, 8)
rough = np.full((H, W), 0.5, np.float32)
ao = np.ones((H, W), np.float32)
height = np.zeros((H, W), np.float32)


def put(region, rgb, rg, a, hgt):
    x, y, w, h = region
    albedo[y : y + h, x : x + w] = rgb
    rough[y : y + h, x : x + w] = rg
    ao[y : y + h, x : x + w] = a
    height[y : y + h, x : x + w] = hgt


# ---- shell: one body plate, wrapped around the body
x, y, w, h = SHELL
u = np.linspace(0, 1, w)[None, :].repeat(h, 0)
s = np.linspace(0, 1, h)[:, None].repeat(w, 1)
c = np.abs(u - 0.5) * 2  # 0 dorsal ridge .. 1 belly line
n1 = noise(h, w, seed=1)
n2 = noise(h, w, scales=(16, 48, 96), amps=(1, 0.7, 0.5), seed=2)
body = mix((82, 44, 20), (120, 72, 30), 0.5 + 1.2 * n1)  # a real tiger/house centipede: dull orange-brown
body = body * (1 + 0.25 * n2[..., None])
dorsal = np.exp(-((c / 0.1) ** 2))
body = body + dorsal[..., None] * np.array([-34, -22, -10], np.float32)  # darker dorsal stripe
flank = mix(body, (110, 55, 24), (c - 0.55) / 0.2)
rgb = flank
belly = np.clip((c - 0.78) / 0.12, 0, 1)
rgb = rgb * (1 - belly[..., None]) + belly[..., None] * mix((130, 96, 54), (156, 120, 70), 0.5 + n1)
# darker rear margin and a dark groove at the front edge of each plate
rim = np.clip((s - 0.86) / 0.1, 0, 1)
rgb = rgb * (1 - 0.55 * rim[..., None] * (1 - belly[..., None]))
groove = np.clip(1 - s / 0.07, 0, 1)
rgb = rgb * (1 - 0.8 * groove[..., None])
# pale mid-line on the belly, scars
line = np.exp(-(((c - 1.0) / 0.03) ** 2))
rgb = rgb + line[..., None] * np.array([30, 28, 16], np.float32)
scar_n = noise(h, w, scales=(64, 128), amps=(1, 0.6), seed=3)
scars = np.clip((scar_n - 0.18) * 6, 0, 1) * (1 - belly)
rgb = rgb * (1 - 0.35 * scars[..., None])
rg = 0.5 + 0.15 * np.clip(n2 + 0.5, 0, 1) + 0.25 * belly + 0.4 * groove + 0.2 * rim
a = 1 - 0.7 * groove - 0.25 * rim
hg = np.sin(np.pi * np.clip(s, 0, 1)) ** 0.5 * 0.7 + dorsal * 0.35 + 0.08 * n2 - 0.4 * groove
put(SHELL, np.clip(rgb, 0, 255), np.clip(rg, 0.12, 0.9), a, hg)

# ---- legs: yellow-brown with dark joint rings and a dark claw tip
x, y, w, h = LEGS
u = np.linspace(0, 1, w)[None, :].repeat(h, 0)
t = np.linspace(0, 1, h)[:, None].repeat(w, 1)
ln = noise(h, w, seed=4)
leg = mix((88, 54, 26), (126, 82, 38), 0.5 + 1.0 * ln)  # dull brown-orange, matte: sits in the scene lighting
shade = 0.75 + 0.35 * np.sin(u * 2 * np.pi * 2 + 1.0) ** 2
leg = leg * shade[..., None]
for j in (0.32, 0.62):
    ring = np.exp(-(((t - j) / 0.035) ** 2))
    leg = leg * (1 - 0.7 * ring[..., None])
tip = np.clip((t - 0.9) / 0.08, 0, 1)
leg = mix_leg = leg * (1 - tip[..., None]) + tip[..., None] * np.array([34, 12, 8], np.float32)
base = np.clip(1 - t / 0.1, 0, 1)
leg = leg * (1 - 0.4 * base[..., None])
put(LEGS, np.clip(leg, 0, 255), 0.7 + 0.15 * np.abs(ln), 1 - 0.3 * base, 0.4 * np.sin(t * np.pi * 9) ** 2 * 0.3 + 0.1 * ln)

# ---- head: dark maroon plate, lighter forehead patch, dark sutures
x, y, w, h = HEAD
u = np.linspace(0, 1, w)[None, :].repeat(h, 0)
v = np.linspace(0, 1, h)[:, None].repeat(w, 1)
hn = noise(h, w, seed=5)
head = mix((96, 52, 22), (134, 80, 34), 0.5 + 1.1 * hn)
patch = np.exp(-(((u - 0.5) / 0.22) ** 2 + ((v - 0.45) / 0.3) ** 2))
head = head + patch[..., None] * np.array([34, 14, 6], np.float32)
suture = np.exp(-(((u - 0.5) / 0.012) ** 2)) + np.exp(-(((v - 0.78) / 0.02) ** 2))
head = head * (1 - 0.7 * np.clip(suture, 0, 1)[..., None])
edge = np.clip(np.maximum(np.abs(u - 0.5) * 2, np.abs(v - 0.5) * 2) - 0.82, 0, 1) / 0.18
head = head * (1 - 0.6 * edge[..., None])
put(HEAD, np.clip(head, 0, 255), 0.24 + 0.2 * np.abs(hn), 1 - 0.5 * edge, 0.5 * (1 - edge) + 0.1 * hn - 0.3 * suture)

# ---- pincers: dark red base, near-black glossy tip, a pale wet ridge
x, y, w, h = PINCER
t = np.linspace(0, 1, h)[:, None].repeat(w, 1)
u = np.linspace(0, 1, w)[None, :].repeat(h, 0)
pn = noise(h, w, seed=6)
pin = mix((92, 48, 20), (40, 20, 12), np.clip((t - 0.25) / 0.6, 0, 1))
pin = pin * (1 + 0.2 * pn[..., None])
ridge = np.exp(-(((u - 0.5) / 0.08) ** 2)) * (1 - t)
pin = pin + ridge[..., None] * np.array([40, 18, 8], np.float32)
put(PINCER, np.clip(pin, 0, 255), 0.14 + 0.12 * t + 0.08 * np.abs(pn), 1 - 0.2 * (1 - t), 0.3 * ridge + 0.1 * pn)

# ---- antennae: banded orange-brown
x, y, w, h = ANT
t = np.linspace(0, 1, h)[:, None].repeat(w, 1)
an = mix((150, 80, 30), (70, 28, 14), t)
band = 0.7 + 0.3 * (np.sin(t * np.pi * 14) > 0)
an = an * band[..., None]
put(ANT, np.clip(an, 0, 255), 0.4, 1.0, 0.15 * (np.sin(t * np.pi * 14) > 0))

# ---- fill the rest of the atlas with a neutral dark chitin so no stray UV samples bright
mask = np.zeros((H, W), bool)
for r in (SHELL, LEGS, HEAD, PINCER, ANT):
    mask[r[1] : r[1] + r[3], r[0] : r[0] + r[2]] = True
albedo[~mask] = (40, 12, 9)
rough[~mask] = 0.4

alb_img = Image.fromarray(np.clip(albedo, 0, 255).astype(np.uint8))
alb_img.save(OUT + "albedo.png")

orm = np.zeros((H, W, 3), np.float32)
orm[..., 0] = ao * 255
orm[..., 1] = rough * 255
orm[..., 2] = 0
Image.fromarray(orm.astype(np.uint8)).resize((512, 256), Image.LANCZOS).save(OUT + "orm.png")

hs = np.asarray(Image.fromarray(((height - height.min()) / (np.ptp(height) + 1e-6) * 255).astype(np.uint8)).resize((512, 256), Image.LANCZOS), np.float32) / 255.0
gx = np.zeros_like(hs)
gy = np.zeros_like(hs)
gx[:, 1:-1] = hs[:, 2:] - hs[:, :-2]
gy[1:-1, :] = hs[2:, :] - hs[:-2, :]
k = 6.0
nx, ny, nz = -gx * k, gy * k, np.ones_like(hs)
ln_ = np.sqrt(nx * nx + ny * ny + nz * nz)
normal = np.stack([nx / ln_, ny / ln_, nz / ln_], -1) * 0.5 + 0.5
Image.fromarray((normal * 255).astype(np.uint8)).save(OUT + "normal.png")
print("ATLAS", OUT)
