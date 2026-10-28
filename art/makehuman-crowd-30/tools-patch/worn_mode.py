"""worn_mode.py: palette mode "worn" for the MakeHuman factory (Armagedom crowd batch 2). Needs numpy only (runs inside Blender's Python).
Row: {"match": "\\.male_casualsuit03$", "mode": "worn", "rects": [[x0,y0,x1,y1]], "in": [r,g,b], "out": [r,g,b], "logo_rects": [[x0,y0,x1,y1]], "dirt": 0.4, "fade": 0.15, "seed": 7}
All rectangles are fractions of the diffuse image, top-left origin (same as mode "regions").
 1. "regions" recolour: pixels inside `rects` (the trousers or skirt) take `in`, the rest `out`, shading kept.
 2. logo fill: the stock shirts carry a round MakeHuman logo print; every rect in `logo_rects` is filled with the median colour of the cloth around it (feathered), so no print survives.
 3. wear: low-frequency dirt mottling (three octaves of value noise, darker and browner where it is thick) and a fade toward the pixel's own grey, both seeded."""
import numpy as np


def _up(small, H, W):
    h, w = small.shape
    ys = np.linspace(0, h - 1, H); xs = np.linspace(0, w - 1, W)
    y0 = np.floor(ys).astype(int); y1 = np.minimum(y0 + 1, h - 1); fy = (ys - y0)[:, None]
    x0 = np.floor(xs).astype(int); x1 = np.minimum(x0 + 1, w - 1); fx = (xs - x0)[None, :]
    top = small[y0][:, x0] * (1 - fx) + small[y0][:, x1] * fx
    bot = small[y1][:, x0] * (1 - fx) + small[y1][:, x1] * fx
    return top * (1 - fy) + bot * fy


def apply(rgb, a, spec, size, base):
    W, H = int(size[0]), int(size[1])
    out = base(rgb, a, dict(spec, mode='regions'), size).astype(np.float32)
    img = out.reshape(H, W, 3).copy()           # image row 0 is the BOTTOM of the picture (Blender); a rectangle's y is measured from the top
    al = np.asarray(a, np.float32).reshape(H, W)
    rng = np.random.default_rng(int(spec.get('seed', 1)))
    pad = max(4, int(0.03 * W))
    for x0, y0, x1, y1 in spec.get('logo_rects', []):
        c0, c1 = int(x0 * W), int(x1 * W); r0, r1 = H - int(y1 * H), H - int(y0 * H)
        a0, a1, b0, b1 = max(0, r0 - pad), min(H, r1 + pad), max(0, c0 - pad), min(W, c1 + pad)
        win = img[a0:a1, b0:b1]; ring = np.ones(win.shape[:2], bool); ring[r0 - a0:r1 - a0, c0 - b0:c1 - b0] = False
        ring &= al[a0:a1, b0:b1] > 0.5
        if not ring.any(): continue
        fill = np.median(win[ring], axis=0)
        h, w = r1 - r0, c1 - c0
        yy = np.minimum(np.arange(h), np.arange(h)[::-1])[:, None]; xx = np.minimum(np.arange(w), np.arange(w)[::-1])[None, :]
        feather = np.clip(np.minimum(yy, xx) / max(2.0, 0.012 * W), 0, 1)[..., None]
        patch = fill[None, None, :] * (1 + 0.04 * (_up(rng.random((max(2, h // 8), max(2, w // 8))), h, w) - 0.5))[..., None]
        img[r0:r1, c0:c1] = img[r0:r1, c0:c1] * (1 - feather) + patch * feather
    dirt = float(spec.get('dirt', 0.4)); fade = float(spec.get('fade', 0.15))
    g = 0.5 * _up(rng.random((6, 6)), H, W) + 0.3 * _up(rng.random((24, 24)), H, W) + 0.2 * _up(rng.random((96, 96)), H, W)
    g = np.clip((g - 0.35) / 0.5, 0, 1) ** 1.5 * dirt                            # 0 clean .. dirt thick
    lum = (img @ np.array([0.299, 0.587, 0.114], np.float32))[..., None]
    img = img * (1 - fade) + lum * fade                                          # sun fade
    img = img * (1 - 0.6 * g[..., None]) + g[..., None] * 0.6 * np.array([0.16, 0.12, 0.08], np.float32)      # grime: darker and browner
    return np.clip(img.reshape(-1, 3), 0, 1)
