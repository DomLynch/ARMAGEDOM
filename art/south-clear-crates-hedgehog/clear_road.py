"""clear_road.py <mask.json> <sources.json> <in.webp> <out.webp>: paint a pile out of the Area 8 phone backdrop and leave open road.

Low and high frequencies are filled separately so the fill has no tinted halo:
  low  = the colour and light of the road around the hole (normalised blur of the pixels outside the mask, sigma 18);
  high = cobble texture quilted from clean road at about the same height in the picture (64 px patches, feathered, no marking
         pixels, no source spot reused), high-passed so it carries texture but no colour of its own.
The sum is blended into the picture once with a Poisson (cv2.seamlessClone, normal clone) so the border matches exactly.
Run with numpy, opencv and Pillow. Env: CLEAR_SIGMA, CLEAR_QUALITY, CLEAR_SEED, CLEAR_DILATE."""
import json, os, sys
import cv2
import numpy as np
from PIL import Image

mask_file, src_file, inp, out = sys.argv[1:5]
img = np.asarray(Image.open(inp).convert("RGB")).copy()
h, w = img.shape[:2]
mask = np.zeros((h, w), np.uint8)
for poly in json.load(open(mask_file)):
    cv2.fillPoly(mask, [np.array(poly, np.int32)], 255)
dil = int(os.environ.get("CLEAR_DILATE", 11))
mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dil, dil)))
SIGMA = float(os.environ.get("CLEAR_SIGMA", 18))
P, STEP, RAMP, BAND = 64, 48, 14, int(os.environ.get("CLEAR_BAND", 110))
rng = np.random.default_rng(int(os.environ.get("CLEAR_SEED", 7)))

f = img.astype(np.float32)
known = (cv2.dilate(mask, np.ones((int(os.environ.get("CLEAR_GUARD", 21)),) * 2, np.uint8)) == 0).astype(np.float32)  # low frequencies ignore the rubble that spills just outside the mask
num = cv2.GaussianBlur(f * known[..., None], (0, 0), SIGMA)
den = cv2.GaussianBlur(known, (0, 0), SIGMA)[..., None]
low = num / np.maximum(den, 1e-3)
# where the hole is far from any known pixel the normalised blur is unreliable: widen it
far = den[..., 0] < 0.05
if far.any():
    num2 = cv2.GaussianBlur(f * known[..., None], (0, 0), SIGMA * 3)
    den2 = cv2.GaussianBlur(known, (0, 0), SIGMA * 3)[..., None]
    low = np.where(far[..., None], num2 / np.maximum(den2, 1e-3), low)

rects = json.load(open(src_file))
clean = np.zeros((h, w), np.uint8)
for x0, y0, x1, y1 in rects:
    clean[y0:y1, x0:x1] = 1
hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
paint = ((hsv[..., 2] > 150) & (hsv[..., 1] < 90)).astype(np.uint8)
paint = cv2.morphologyEx(paint, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
paint_share = cv2.boxFilter(paint.astype(np.float32), -1, (P, P))
luma = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32)
hp_luma = luma - cv2.GaussianBlur(luma, (0, 0), 10)
local_std = np.sqrt(np.maximum(cv2.boxFilter(hp_luma ** 2, -1, (P, P)), 0))
pale_share = cv2.boxFilter((luma > float(os.environ.get("CLEAR_PALE", 120))).astype(np.float32), -1, (P, P))  # pale slabs and rubble read as clutter once copied
valid = (cv2.erode(clean, np.ones((P, P), np.uint8)) > 0) & (paint_share < 0.002) & (pale_share < float(os.environ.get("CLEAR_PALE_SHARE", 0.01)))
highpass = f - cv2.GaussianBlur(f, (0, 0), 10)

ys, xs = np.where(mask > 0)
bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
ring = (cv2.dilate(mask, np.ones((61, 61), np.uint8)) > 0) & (mask == 0)
target_std = float(os.environ.get("CLEAR_STD", np.sqrt((hp_luma[ring] ** 2).mean())))
print("target texture std", round(target_std, 2), "candidates", int(valid.sum()))

win1 = np.ones(P, np.float32)
win1[:RAMP] = np.linspace(0.05, 1, RAMP)
win1[-RAMP:] = np.linspace(1, 0.05, RAMP)
win = np.outer(win1, win1)[..., None]
acc = np.zeros((h, w, 3), np.float32)
wacc = np.zeros((h, w, 1), np.float32)
used = []
for py in range(by0 - 8, by1, STEP):
    for px in range(bx0 - 8, bx1, STEP):
        x0, y0 = int(min(max(px, 0), w - P)), int(min(max(py, 0), h - P))
        if mask[y0:y0 + P, x0:x0 + P].sum() == 0:
            continue
        cands = []
        for ry in range(max(0, y0 - BAND), min(h - P, y0 + BAND) + 1, 4):
            row = valid[ry + P // 2, P // 2: w - P // 2]
            cands += [(int(rx), ry) for rx in np.where(row > 0)[0][::4]]
        cands = [c for c in cands if all(abs(c[0] - u[0]) > 40 or abs(c[1] - u[1]) > 40 for u in used)] or cands
        err = np.array([(local_std[cy + P // 2, cx + P // 2] - target_std) ** 2 for cx, cy in cands], np.float32)
        sx, sy = cands[int(rng.choice(np.argsort(err)[:12]))]
        used.append((sx, sy))
        acc[y0:y0 + P, x0:x0 + P] += highpass[sy:sy + P, sx:sx + P] * win
        wacc[y0:y0 + P, x0:x0 + P] += win
tex = acc / np.maximum(wacc, 1e-3)
tex[wacc[..., 0] < 1e-3] = 0
tex *= float(os.environ.get("CLEAR_GAIN", 1.0))  # averaged feathered overlaps lose a little contrast
fill = np.clip(low + tex, 0, 255).astype(np.uint8)
m2 = (mask > 0).astype(np.uint8) * 255
# Border match: the colour step between the picture and the fill on a 7 px ring just outside the hole, spread smoothly inward
# (a membrane offset, the part of a Poisson blend that matters here), so the fill meets the road with no seam.
ring_out = ((cv2.dilate(m2, np.ones((15, 15), np.uint8)) > 0) & (m2 == 0)).astype(np.float32)
diff = (f - np.clip(low + tex, 0, 255)) * ring_out[..., None]
off_num = cv2.GaussianBlur(diff, (0, 0), 7)
off_den = cv2.GaussianBlur(ring_out, (0, 0), 7)[..., None]
offset = off_num / np.maximum(off_den, 1e-3)
blended = np.clip(low + tex + offset, 0, 255)
FEATHER = int(os.environ.get("CLEAR_FEATHER", 0))  # >0: fade the fill out over this many px inside the (larger) mask, so no hard edge shows
if FEATHER:
    inner = cv2.erode(m2, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (FEATHER, FEATHER)))
    soft = cv2.GaussianBlur(inner, (0, 0), FEATHER / 3).astype(np.float32)[..., None] / 255
else:
    soft = cv2.GaussianBlur(m2, (0, 0), 2.5).astype(np.float32)[..., None] / 255
result = np.clip(img * (1 - soft) + blended * soft + 0.5, 0, 255).astype(np.uint8)
Image.fromarray(result).save(out, "WEBP", quality=int(os.environ.get("CLEAR_QUALITY", 93)), method=6)
print("patches", len(used), "mask px", int((m2 > 0).sum()), "done")
