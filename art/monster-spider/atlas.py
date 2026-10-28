"""Spider textures (Pillow + numpy, CPU): albedo atlas 1024, ORM 512 (roughness in G), normal 512. All painted from rules, no reference image.

Layout (UV v up; image row 0 is v 1):
  top-left      abdomen top: dark warm chitin, pale chevrons down the midline, two rows of pale spots, ochre halo
  top-right     cephalothorax: dark, pale median band, pale rim, ochre streaks
  bottom-left   legs: u around the limb, v along it; dark with pale bands at the knee and above the foot, fine speckle
  bottom-right  bristle gradient (dark root to pale tip, x 560-600), fang gradient (x 640-760), eye texel (x 900-1023, y 512-767)
"""
import numpy as np
from PIL import Image, ImageFilter

rng = np.random.default_rng(2812)
N = 1024
# Realistic palette (a big huntsman or tarantula): muted browns, no cream, no bright marking.
DARK = np.array((36, 28, 22), np.float32)
WARM = np.array((66, 50, 36), np.float32)
OCHRE = np.array((94, 74, 52), np.float32)
PALE = np.array((118, 96, 72), np.float32)


def noise(h, w, cells):
    g = rng.random((max(2, cells * h // w), cells)).astype(np.float32)
    return np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255.0


def smooth(a, lo, hi):
    t = np.clip((a - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, m):
    return a + (b - a) * m[..., None]


def blur(arr, r):
    ch = [Image.fromarray(np.clip(arr[..., k], 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)) for k in range(3)]
    return np.stack([np.asarray(c, np.float32) for c in ch], -1)


def base(h, w, warm_amount=0.45):
    n1, n2 = noise(h, w, 6), noise(h, w, 28)
    m = np.clip((n1 * 0.7 + n2 * 0.3 - 0.35) * warm_amount * 2.2, 0, 1)
    return mix(np.broadcast_to(DARK, (h, w, 3)).copy(), np.broadcast_to(WARM, (h, w, 3)).copy(), m)


def grit(a, amt):
    return a + rng.normal(0, amt, a.shape[:2]).astype(np.float32)[..., None]


# --- abdomen top, 512 x 512: x across (-1..1), s along the body (0 front, 1 rear; rear at the image top)
yy, xx = np.mgrid[0:512, 0:512].astype(np.float32)
x = (xx / 511.0) * 2 - 1
s = 1 - yy / 511.0
ab = base(512, 512)
pale = np.zeros((512, 512), np.float32)
for k, (s0, th) in enumerate(((0.18, 0.04), (0.38, 0.035), (0.58, 0.03), (0.78, 0.024))):
    d = np.abs(s - (s0 + 0.30 * np.abs(x)))
    arm = smooth(0.78 - np.abs(x), 0.0, 0.12)
    pale = np.maximum(pale, (1 - smooth(d, th * 0.5, th)) * arm)
for sy in (0.2, 0.4, 0.6, 0.78):
    for sx in (-0.78, 0.78):
        d = np.hypot((x - sx) * 1.0, (s - sy) * 1.4)
        pale = np.maximum(pale, 1 - smooth(d, 0.03, 0.055))
halo = blur(np.stack([pale * 255] * 3, -1), 7)[..., 0] / 255.0
ab = mix(ab, OCHRE, np.clip(halo * 1.6, 0, 1) * 0.65)
ab = mix(ab, PALE, smooth(pale, 0.35, 0.8) * 0.55 * (0.7 + 0.3 * noise(512, 512, 40)))
ab = grit(ab, 5)

# --- cephalothorax, 512 x 512: pale median band, pale rim, ochre streaks
ce = base(512, 512, 0.55)
band = (1 - smooth(np.abs(x), 0.08, 0.2)) * smooth(s, 0.1, 0.22) * (1 - smooth(s, 0.8, 0.92))
rim = smooth(np.hypot(x * 0.9, (s - 0.5) * 1.05), 0.86, 0.97)
streak = (np.sin(np.arctan2(x, s - 0.1 + 0.001) * 14 + noise(512, 512, 12) * 3) > 0.55).astype(np.float32) * smooth(s, 0.15, 0.4) * (1 - smooth(np.abs(x), 0.5, 0.8))
ce = mix(ce, OCHRE, np.clip(streak * 0.45 + rim * 0.5, 0, 1))
ce = mix(ce, PALE, band * 0.45)
ce = grit(ce, 5)

# --- legs, 512 x 512: u around (0..1 over the left 0..~512), v along (image row 512..1023 maps v 0..0.5; the legs use v 0.04..0.46)
yy2, xx2 = np.mgrid[0:512, 0:512].astype(np.float32)
t = 1 - yy2 / 511.0  # along the limb: 0 root (bottom of the image) -> 1 tip (top)... the build maps v up with t
leg = base(512, 512, 0.5)
ring = np.zeros_like(t)
for c, w in ((0.34, 0.018), (0.62, 0.016)):
    ring = np.maximum(ring, 1 - smooth(np.abs(t - c), w * 0.4, w))
fine = (np.sin(t * 150 + noise(512, 512, 10) * 4) > 0.9).astype(np.float32) * 0.35
leg = mix(leg, OCHRE, np.clip(fine + 0.3 * noise(512, 512, 14), 0, 1) * 0.55)
leg = mix(leg, np.array((150, 124, 94), np.float32), ring * 0.75)  # lighter tan leg bands so the legs read at phone size (texture only)
leg = grit(leg, 5)

atlas = np.zeros((N, N, 3), np.float32)
atlas[:] = DARK
atlas[0:512, 0:512] = ab
atlas[0:512, 512:1024] = ce
atlas[512:1024, 0:512] = leg

# --- bottom-right: bristle gradient (v 0.05 root dark -> v 0.45 tip pale), fang gradient, eye texel
for row in range(512, 1024):
    v = 1 - row / 1023.0  # 0..0.5
    f = np.clip((v - 0.05) / 0.4, 0, 1)  # 0 at the root, 1 at the tip
    atlas[row, 560:600] = DARK * (1 - f) + OCHRE * f * 0.95
    g = np.clip((v - 0.02) / 0.46, 0, 1)
    atlas[row, 640:760] = np.array((24, 20, 17), np.float32) * (1 - g) + np.array((44, 36, 29), np.float32) * g  # dark brown-black, matte
# eye texel: black glass, a warm red rim, a bright highlight upper left
ey, ex = np.mgrid[0:256, 0:124].astype(np.float32)
cx, cy = 62 - 18, 128 - 38
d = np.hypot(ex - cx, ey - cy)
eye = np.zeros((256, 124, 3), np.float32) + np.array((6, 4, 5), np.float32)
rimm = smooth(np.hypot(ex - 62, ey - 128), 40, 62)
eye = mix(eye, np.broadcast_to(np.array((30, 22, 18), np.float32), eye.shape).copy(), rimm * 0.6)
eye = mix(eye, np.broadcast_to(np.array((58, 48, 40), np.float32), eye.shape).copy(), (1 - smooth(d, 6, 20)) * 0.6)  # a faint dull sheen, never a glint
atlas[512:768, 900:1024] = eye

atlas = np.clip(atlas, 0, 255).astype(np.uint8)
Image.fromarray(atlas).save("albedo.png")

# --- ORM (512): green = roughness. Hairy chitin stays satin (0.35..0.8); the cephalothorax and eye/fang texels are glossy.
a = np.asarray(Image.fromarray(atlas).resize((512, 512), Image.LANCZOS), np.float32) / 255.0
lum = 0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]
rough = np.clip(0.55 + 0.4 * lum, 0.5, 0.9)  # matte hair and chitin, a real animal
rough[0:256, 256:512] = np.clip(0.45 + 0.4 * lum[0:256, 256:512], 0.45, 0.85)  # cephalothorax
rough[256:512, 320:380] = 0.8  # fang gradient: matte
rough[256:384, 450:512] = 0.6  # eye texel: dull, not glossy
orm = np.stack([np.full_like(rough, 1.0), rough, np.zeros_like(rough)], -1)
Image.fromarray((orm * 255).astype(np.uint8)).save("orm.png")

# --- normal from luminance height, tangent space
h = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)), np.float32) / 255.0
dx = np.roll(h, -1, 1) - np.roll(h, 1, 1)
dy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
nrm = np.stack([-dx * 3.0, dy * 3.0, np.ones_like(h)], -1)
nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
Image.fromarray(((nrm * 0.5 + 0.5) * 255).astype(np.uint8)).save("normal.png")
print("atlas done")
