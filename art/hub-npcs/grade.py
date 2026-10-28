#!/usr/bin/env python3
"""Worn-2030 grade for one body atlas (PIL + numpy). usage: grade.py in.webp out.webp '<json params>'
Params: desat (0..1 toward grey), gamma (>1 darkens), tint [r,g,b] multiply, lift [r,g,b] (pulls light low-saturation cloth toward a pale tint),
grime (0..1 strength of seeded low-frequency dirt), seed."""
import sys, json
import numpy as np
from PIL import Image, ImageFilter

src, dst, raw = sys.argv[1:4]
p = json.loads(raw)
rgba = Image.open(src).convert("RGBA")
a = np.asarray(rgba).astype(np.float32) / 255.0
rgb, alpha = a[..., :3], a[..., 3:]
grey = (rgb * np.array([0.299, 0.587, 0.114], np.float32)).sum(-1, keepdims=True)
rgb = grey + (rgb - grey) * (1.0 - p.get("desat", 0.0))
rgb = np.clip(rgb, 0, 1) ** p.get("gamma", 1.0)
rgb = rgb * np.array(p.get("tint", [1, 1, 1]), np.float32)
lift = p.get("lift")
if lift:
    mx, mn = rgb.max(-1, keepdims=True), rgb.min(-1, keepdims=True)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    mask = np.clip((mx - 0.5) / 0.3, 0, 1) * np.clip((0.3 - sat) / 0.1, 0, 1)
    rgb = rgb * (1 - mask * 0.5) + np.array(lift, np.float32) * mask * 0.5
g = p.get("grime", 0.0)
if g:
    rng = np.random.default_rng(p.get("seed", 1))
    h, w = rgb.shape[:2]
    noise = Image.fromarray((rng.random((h // 16, w // 16)) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(6))
    n = np.asarray(noise).astype(np.float32)[..., None] / 255.0
    rgb = rgb * (1.0 - g * (0.55 + 0.45 * n) * 0.5)
out = np.concatenate([np.clip(rgb, 0, 1), alpha], -1)
Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA").save(dst, "WEBP", quality=82, method=6)
