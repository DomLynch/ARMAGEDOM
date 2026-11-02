"""Roach v3 textures built from Dom's reference image: albedo atlas 1024, ORM 512 (roughness in G), normal 512.

Layout (image rows, top = v 1): top-left shell (plates, wing cases), top-right belly (olive-amber, old body + head underside),
bottom-left legs (u = around the limb, v = along it), bottom-right: head crop | antenna rings | eye texel.
"""
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance, ImageDraw

REF = "cockroach-style-target.webp"
rng = np.random.default_rng(2711)
ref = Image.open(REF).convert("RGB")


def crop(box, size, sharpen=True, flip=False):
    c = ref.crop(box)
    if flip:
        c = c.transpose(Image.FLIP_LEFT_RIGHT)
    c = c.resize(size, Image.LANCZOS)
    if sharpen:
        c = c.filter(ImageFilter.UnsharpMask(radius=2, percent=90, threshold=2))
    return c


def noise(w, h, cells):
    g = rng.random((max(2, cells * h // w), cells)).astype(np.float32)
    return np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255.0


def mirror_tile(img):
    """Make an image seamless by mirroring: [img | flip] over [flipv | both]."""
    w, h = img.size
    out = Image.new("RGB", (w * 2, h * 2))
    out.paste(img, (0, 0))
    out.paste(img.transpose(Image.FLIP_LEFT_RIGHT), (w, 0))
    out.paste(img.transpose(Image.FLIP_TOP_BOTTOM), (0, h))
    out.paste(img.transpose(Image.ROTATE_180), (w, h))
    return out.resize((w, h), Image.LANCZOS)


def grit(arr, amt):
    return arr + rng.normal(0, amt, arr.shape[:2]).astype(np.float32)[..., None]


def finish(img, grit_amt=6, dark=0.92):
    a = np.asarray(img, np.float32) * dark
    return grit(a, grit_amt)


# shell 512x512: pronotum crop over the plate crop over the wing crop (all three from the reference carapace)
shell = Image.new("RGB", (512, 512))
shell.paste(crop((475, 395, 700, 520), (512, 190)), (0, 0))
shell.paste(crop((560, 520, 735, 610), (512, 170)), (0, 190))
shell.paste(crop((235, 352, 440, 416), (512, 152)), (0, 360))
shell = Image.fromarray(np.clip(finish(shell), 0, 255).astype(np.uint8))

# belly 512x512: the olive-amber underbelly crop, pushed toward green-amber, with dark rib bands
belly = crop((140, 440, 290, 640), (512, 512))
belly = ImageEnhance.Color(belly).enhance(1.35)
ba = np.asarray(belly, np.float32)
bands = (np.sin(np.arange(512) / 9.0) > 0.65).astype(np.float32)[:, None, None]
ba = ba * (1 - bands * 0.12)
belly = Image.fromarray(np.clip(finish(Image.fromarray(ba.astype(np.uint8)), 5, 1.0), 0, 255).astype(np.uint8))

# legs 512x512: u across the limb (top of leg at u 0.25 centre), v along it: the reference leg crop, softened then re-gritted
leg_src = crop((415, 640, 500, 900), (170, 512), sharpen=False)
leg = Image.new("RGB", (512, 512))
leg.paste(leg_src, (0, 0))
leg.paste(leg_src.transpose(Image.FLIP_LEFT_RIGHT), (170, 0))
leg.paste(leg_src, (340, 0))
leg = leg.filter(ImageFilter.GaussianBlur(0.8)).filter(ImageFilter.UnsharpMask(radius=2, percent=80, threshold=3))
la = np.asarray(leg, np.float32)
seg = (np.sin(np.arange(512) / 14.0) > 0.7).astype(np.float32)[:, None, None]
la = la * (1 - seg * 0.35)
leg = Image.fromarray(np.clip(grit(la, 6), 0, 255).astype(np.uint8))

# head 240x512 (bottom-right left part): reference head crop stretched, lower part darker mandible tone
head = Image.new("RGB", (240, 512), (40, 28, 22))
head.paste(crop((690, 640, 840, 780), (240, 300)), (0, 0))
head.paste(crop((700, 700, 840, 780), (240, 212), flip=True), (0, 300))

# antenna strip 100x512 plus cerci: dark chitin with amber rings (period ~16 px)
ant = np.zeros((512, 100, 3), np.float32)
ring = (np.sin(np.arange(512) / 4.2) > 0.2).astype(np.float32)[:, None]
dark = np.array((26, 16, 12), np.float32)
amber = np.array((104, 66, 34), np.float32)
ant[:] = dark + (amber - dark) * ring[..., None] * (0.8 + 0.2 * noise(100, 512, 6))[..., None]
ant = grit(ant, 6)

atlas = Image.new("RGB", (1024, 1024), (24, 18, 15))
atlas.paste(shell, (0, 0))
atlas.paste(Image.fromarray(np.clip(np.asarray(belly), 0, 255).astype(np.uint8)), (512, 0))
atlas.paste(leg, (0, 512))
atlas.paste(head, (512, 512))
atlas.paste(Image.fromarray(np.clip(ant, 0, 255).astype(np.uint8)), (778, 512))
d = ImageDraw.Draw(atlas)
d.rectangle([900, 512, 1023, 767], fill=(6, 5, 5))  # eye texel
d.ellipse([940, 560, 960, 580], fill=(210, 200, 190))
atlas.save("albedo.png")

# ORM: green = roughness (dark wet areas glossy, scars rougher), blue = metal 0
a = np.asarray(atlas.resize((512, 512), Image.LANCZOS), np.float32) / 255.0
lum = 0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]
rough = np.clip(0.18 + 0.75 * lum ** 0.8, 0.18, 0.85)
rough[256:384, 450:512] = 0.05  # eye texel (rows 256-383, cols 450-511 of the 512 map)
orm = np.stack([np.full_like(rough, 1.0), rough, np.zeros_like(rough)], -1)
Image.fromarray((orm * 255).astype(np.uint8)).save("orm.png")

# normal from luminance height (scars and plates), tangent space
h = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 255.0
dx = np.roll(h, -1, 1) - np.roll(h, 1, 1)
dy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
s = 3.0
n = np.stack([-dx * s, dy * s, np.ones_like(h)], -1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save("normal.png")
print("atlas done")
