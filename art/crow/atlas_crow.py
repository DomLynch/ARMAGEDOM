"""Crow textures (CPU, Pillow + numpy): albedo 1024x512, ORM 512x256, normal 512x256.

Layout (image top = v 1): the left square (u 0 to .5) is the plumage tile of the body, neck, head and thighs (rows of overlapping
scallops, each tip catching an oil-slick sheen); the right square (u .5 to 1) is one flight feather (u across, v base to tip: shaft,
barbs, ragged vane edge) used by wings, tail, hackles and head tufts.
Run: python3 atlas_crow.py   (writes albedo.png orm.png normal.png next to this file)
"""
import numpy as np
from PIL import Image, ImageFilter

rng = np.random.default_rng(2810)
SQ = 512


def smooth_noise(h, w, cells, seed):
    r = np.random.default_rng(seed)
    g = r.random((max(2, cells * h // w), cells)).astype(np.float32)
    img = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return np.asarray(img, np.float32) / 255.0


def sheen_colour(field):
    """Oil slick: field 0..1 walks blue, teal, violet, warm bronze. Returns (h, w, 3) in 0..1."""
    stops = np.array([[0.07, 0.16, 0.42], [0.03, 0.32, 0.32], [0.20, 0.09, 0.36], [0.07, 0.16, 0.42], [0.04, 0.24, 0.30]], np.float32)
    x = np.clip(field, 0, 0.9999) * (len(stops) - 1)
    i = x.astype(int)
    f = (x - i)[..., None]
    return stops[i] * (1 - f) + stops[i + 1] * f


def plumage():
    """Scallop rows: returns albedo (SQ,SQ,3 in 0..255), roughness, metal, height."""
    rows, cols = 24, 24
    ch, cw = SQ / rows, SQ / cols
    yy, xx = np.mgrid[0:SQ, 0:SQ].astype(np.float32)
    r = (yy // ch).astype(int)
    off = np.where(r % 2 == 0, 0.0, cw / 2)
    cx = ((xx + off) // cw).astype(int)
    lx = ((xx + off) % cw) / cw  # 0..1 across the scallop
    ly = (yy % ch) / ch  # 0 = top (root side), 1 = bottom (tip)
    # a scallop is the lower arc of a feather: its tip curves down at the middle
    tipline = 0.55 + 0.45 * (1 - (2 * lx - 1) ** 2) ** 0.5
    inside = ly < tipline
    edge = np.clip((ly - (tipline - 0.22)) / 0.22, 0, 1) * inside  # bright rim along the tip
    shade = np.clip(ly / tipline, 0, 1)
    cellrand = np.random.default_rng(7).random((rows + 2, cols + 2)).astype(np.float32)[r % (rows + 2), cx % (cols + 2)]
    field = (smooth_noise(SQ, SQ, 5, 11) * 0.7 + cellrand * 0.3 + 0.35 * (yy / SQ)) % 1.0
    sheen = sheen_colour(field)
    base = np.array([0.20, 0.17, 0.175], np.float32) * (0.75 + 0.5 * cellrand[..., None])
    worn = (smooth_noise(SQ, SQ, 4, 13) > 0.66).astype(np.float32)[..., None]  # a few sun-bleached, rusty patches
    base = base * (1 - worn) + np.array([0.20, 0.14, 0.10], np.float32) * worn * (0.6 + 0.4 * cellrand[..., None])
    k = (0.42 + 0.6 * edge ** 1.4)[..., None] * (1 - 0.7 * worn)
    col = base * (0.55 + 0.6 * shade[..., None]) + sheen * k * (0.45 + 0.55 * cellrand[..., None]) * 0.95
    col = np.where(inside[..., None], col, col * 0.35)  # the gap under a scallop is shadow
    col += rng.normal(0, 0.012, col.shape[:2])[..., None]
    height = shade * inside + 0.3 * edge
    rough = np.clip(0.55 - 0.32 * edge - 0.1 * (1 - worn[..., 0]) + 0.1 * worn[..., 0], 0.18, 0.9)
    metal = np.clip(0.04 + 0.08 * edge, 0, 1) * (1 - worn[..., 0])
    return np.clip(col, 0, 1) * 255, rough, metal, height


def blade():
    """One flight feather: u across, v along (row 0 of the square = tip, last row = base)."""
    yy, xx = np.mgrid[0:SQ, 0:SQ].astype(np.float32)
    t = 1 - yy / SQ  # 0 base .. 1 tip
    s = (xx / SQ - 0.5) * 2  # -1 .. 1 across
    shaft = np.exp(-((s / (0.035 * (1.2 - 0.6 * t))) ** 2))
    barb_phase = (np.abs(s) * 46 + t * 150 + smooth_noise(SQ, SQ, 9, 21) * 6) % 1.0
    barbs = (np.abs(barb_phase - 0.5) * 2) ** 2  # fine diagonal streaks
    sheen = sheen_colour((0.15 + 0.7 * t + 0.25 * smooth_noise(SQ, SQ, 4, 31)) % 1.0)
    vane = np.clip(1 - (np.abs(s) / 0.98) ** 3, 0, 1)
    base = np.array([0.17, 0.145, 0.15], np.float32)
    k = (0.18 + 0.7 * barbs)[..., None] * (0.35 + 0.75 * np.abs(np.sin(np.pi * np.clip(t * 1.15, 0, 1))) ** 1.2)[..., None] * vane[..., None]
    col = base * (0.8 + 0.5 * barbs[..., None]) + sheen * k * 0.7
    col = col * (0.5 + 0.5 * vane[..., None]) + shaft[..., None] * np.array([0.20, 0.17, 0.15], np.float32)
    ragged = (smooth_noise(SQ, SQ, 14, 41) > 0.7).astype(np.float32)[..., None]  # frayed, dusty tips
    col = col * (1 - 0.5 * ragged * (t[..., None] > 0.55)) + np.array([0.12, 0.09, 0.07], np.float32) * ragged * (t[..., None] > 0.55) * 0.5
    col += rng.normal(0, 0.012, col.shape[:2])[..., None]
    height = 0.6 * barbs * vane + 0.4 * shaft
    rough = np.clip(0.5 - 0.25 * barbs * vane, 0.2, 0.9)
    metal = np.clip(0.03 + 0.08 * barbs * vane, 0, 1)
    return np.clip(col, 0, 1) * 255, rough, metal, height


pa, pr, pm, ph = plumage()
ba, br, bm_, bh = blade()
alb = np.concatenate([pa, ba], axis=1).astype(np.uint8)  # (512, 1024, 3)
rough = np.concatenate([pr, br], axis=1)
metal = np.concatenate([pm, bm_], axis=1)
height = np.concatenate([ph, bh], axis=1)

Image.fromarray(alb).save("albedo.png")
orm = np.stack([np.full_like(rough, 1.0), rough, metal], axis=-1)
Image.fromarray((orm * 255).astype(np.uint8)).resize((512, 256), Image.LANCZOS).save("orm.png")
h = np.asarray(Image.fromarray((height * 255).astype(np.uint8)).resize((512, 256), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.8)), np.float32) / 255
gx = np.roll(h, -1, 1) - np.roll(h, 1, 1)
gy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
nz = np.ones_like(h)
n = np.stack([-gx * 5.0, gy * 5.0, nz], -1)  # glTF normal map: +Y up in image space is -row
n /= np.linalg.norm(n, axis=-1, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save("normal.png")
print("ATLAS OK")
