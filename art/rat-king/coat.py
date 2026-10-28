"""Rat King coat texture (Pillow/numpy, CPU): the original 512 px tiling coat re-graded to dark warm umber with hair streaks.
Run: python3 coat.py original-coat.png king-coat.png"""
import sys
import numpy as np
from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
rng = np.random.default_rng(2810)
im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32) / 255.0
lum = im.mean(axis=2)
lum = (lum - lum.mean()) / (lum.std() + 1e-6)
H, W = lum.shape
# hair: many short strokes along one direction, blurred a touch, tiled so the edges meet
hair = np.zeros((H, W), np.float32)
for _ in range(2600):
    x, y = rng.integers(0, W), rng.integers(0, H)
    ln = int(rng.integers(8, 26))
    sgn = rng.choice([-1.0, 1.0])
    for t in range(ln):
        hair[(y + t) % H, (x + int(t * 0.35)) % W] += sgn * 0.5
hair = np.asarray(Image.fromarray(np.clip(hair * 80 + 128, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32)
hair = (hair - 128.0) / 128.0
v = 0.05 + 0.022 * lum + 0.02 * hair
v = np.clip(v, 0.015, 0.3)
warm = np.array([1.0, 0.76, 0.62], np.float32)  # dark brown-grey
rgb = v[..., None] * warm
# a few rust and ash patches
rust = np.clip(lum * 0.5 - 0.35, 0, 1)[..., None] * np.array([0.10, 0.03, -0.01], np.float32)
rgb = np.clip(rgb + rust, 0, 1)
out = (np.power(rgb, 1 / 2.2) * 255).astype(np.uint8)  # texture is sRGB
Image.fromarray(out).save(dst)
print("coat", dst, out.mean(axis=(0, 1)))
