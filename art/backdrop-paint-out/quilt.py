"""quilt.py <area> <mask.json> <sources.json> <out.webp> [original.webp]

Fill the masked painted objects with real road: image quilting from clean road at about the same height in the picture (same perspective
scale), each patch matched against the pixels already known around it and Poisson-blended in (cv2.seamlessClone), so the cobble pattern,
wet highlights and light come from the road itself. Source patches never contain road markings or objects (colour test), and every source
patch lies inside the clean-road rectangles. Pixels no patch reached, and the thin outer edge, are finished with LaMa.
Run with the vlama venv (numpy, opencv, simple-lama-inpainting)."""
import json, os, sys
import cv2
import numpy as np
from PIL import Image
from simple_lama_inpainting import SimpleLama

root = "/Users/domininclynch/Developer/armagedom/.claude/worktrees/arma-chars-f7f72b"
area, mask_file, sources_file, out = sys.argv[1:5]
original = sys.argv[5] if len(sys.argv) > 5 else f"{root}/Web/public/world/{area}/backdrop-phone.webp"
img = np.asarray(Image.open(original).convert("RGB")).copy()
h, w = img.shape[:2]
mask = np.zeros((h, w), np.uint8)
for poly in json.load(open(mask_file)):
    cv2.fillPoly(mask, [np.array(poly, np.int32)], 255)
mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17)))
rects = json.load(open(sources_file))  # clean road rectangles, full-image pixels
clean = np.zeros((h, w), np.uint8)
for x0, y0, x1, y1 in rects:
    clean[y0:y1, x0:x1] = 1
# Road markings are low-saturation bright paint; objects and rubble are bright or very dark clutter. Neither may be copied.
PAINT_MAX = 0.004
hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
paint = ((hsv[..., 2] > 150) & (hsv[..., 1] < 90)).astype(np.uint8)
P, STEP, BAND, TOPK, REUSE = 72, 52, 95, 8, 28
rng = np.random.default_rng(7)
paint_share = cv2.boxFilter(paint.astype(np.float32), -1, (P, P))  # share of marking pixels in the patch around each centre
valid = (cv2.erode(clean, np.ones((P, P), np.uint8)) > 0) & (paint_share < PAINT_MAX)  # inside the clean rectangles, almost no marking
print("candidate centres", int(valid.sum()), "paint share of road rects", float(paint[clean > 0].mean()))
known = mask == 0
# Start from a smooth fill of the surroundings so the Poisson blend below has plausible light all around each patch, not black.
smooth = cv2.inpaint(cv2.cvtColor(img, cv2.COLOR_RGB2BGR), mask, 9, cv2.INPAINT_TELEA)
canvas = cv2.cvtColor(smooth, cv2.COLOR_BGR2RGB)
canvas = cv2.GaussianBlur(canvas, (0, 0), 6) * (mask[..., None] > 0) + canvas * (mask[..., None] == 0)
canvas = np.ascontiguousarray(canvas.astype(np.uint8))
ys, xs = np.where(mask > 0)
bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
pad = 24
placed = 0
used = []
for py in range(by0, by1, STEP):
    for px in range(bx0, bx1, STEP):
        x0, y0 = min(px, w - P), min(py, h - P)
        unknown = ~known[y0:y0 + P, x0:x0 + P]
        if unknown.sum() < 40:
            continue
        tm = known[y0:y0 + P, x0:x0 + P].astype(np.float32)
        tmpl = canvas[y0:y0 + P, x0:x0 + P].astype(np.float32)
        cands = []
        for ry0 in range(max(0, y0 - BAND), min(h - P, y0 + BAND) + 1, 4):
            row = valid[ry0 + P // 2, P // 2: w - P // 2]
            cands += [(int(rx), ry0) for rx in np.where(row > 0)[0][::4]]
        # never reuse a spot of road: a source patch within 36 px of one already used is skipped, so nothing visibly repeats
        cands = [c for c in cands if all(abs(c[0] - u[0]) > REUSE or abs(c[1] - u[1]) > REUSE for u in used)] or cands
        if not cands:
            continue
        wsum = max(float(tm.sum()), 1.0)
        err = np.zeros(len(cands), np.float32)
        if tm.sum() >= 40:
            for i, (cx, cy) in enumerate(cands):
                d = ((img[cy:cy + P, cx:cx + P].astype(np.float32) - tmpl) ** 2).sum(-1) * tm
                err[i] = d.sum() / wsum
            k = int(rng.choice(np.argsort(err)[:TOPK]))
        else:
            k = int(rng.integers(len(cands)))
        sx, sy = cands[k]
        used.append((sx, sy))
        patch = img[sy:sy + P, sx:sx + P]
        dst = cv2.copyMakeBorder(canvas, pad, pad, pad, pad, cv2.BORDER_REPLICATE)
        src_big = dst.copy()
        src_big[y0 + pad:y0 + pad + P, x0 + pad:x0 + pad + P] = patch
        full_mask = np.zeros(dst.shape[:2], np.uint8)
        # The patch also covers 4 px of the neighbour patches already placed inside the mask (never the picture outside it), so the
        # one-pixel ring the Poisson solver leaves at the region border falls on pixels the next patch overwrites.
        grown = cv2.dilate(unknown.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
        grown &= mask[y0:y0 + P, x0:x0 + P] > 0
        full_mask[y0 + pad:y0 + pad + P, x0 + pad:x0 + pad + P] = grown.astype(np.uint8) * 255
        yy, xx = np.where(full_mask > 0)
        centre = (int((xx.min() + xx.max()) // 2), int((yy.min() + yy.max()) // 2))
        try:
            blended = cv2.seamlessClone(src_big, dst, full_mask, centre, cv2.MIXED_CLONE if os.environ.get("QUILT_MIXED") else cv2.NORMAL_CLONE)
            canvas = np.ascontiguousarray(blended[pad:pad + h, pad:pad + w])
        except cv2.error:
            region = unknown
            canvas[y0:y0 + P, x0:x0 + P][region] = patch[region]
        known[y0:y0 + P, x0:x0 + P] = True
        placed += 1
left = (mask > 0) & ~known
print("patches", placed, "unreached px", int(left.sum()))
# LaMa for the seams only: pixels no patch reached plus a thin band along the outer edge of the mask.
edge = cv2.dilate(mask, np.ones((13, 13), np.uint8)) - cv2.erode(mask, np.ones((13, 13), np.uint8))
seam = ((edge > 0) | left).astype(np.uint8) * 255
for bx0_, by0_, bx1_, by1_ in json.load(open(sources_file.replace("src-", "seams-"))):  # visible patch-row seams found by eye
    seam[by0_:by1_, bx0_:bx1_] = 255
ys, xs = np.where(seam > 0)
sx0, sx1, sy0, sy1 = max(0, xs.min() - 64), min(w, xs.max() + 64), max(0, ys.min() - 64), min(h, ys.max() + 64)
filled = np.asarray(SimpleLama()(Image.fromarray(canvas[sy0:sy1, sx0:sx1]), Image.fromarray(seam[sy0:sy1, sx0:sx1])))
fixed = canvas.copy()
region = seam[sy0:sy1, sx0:sx1] > 0
fixed[sy0:sy1, sx0:sx1][region] = filled[:sy1 - sy0, :sx1 - sx0][region]
soft = cv2.GaussianBlur(cv2.dilate(mask, np.ones((5, 5), np.uint8)), (0, 0), 3).astype(np.float32)[..., None] / 255
result = np.clip(img * (1 - soft) + fixed * soft + 0.5, 0, 255).astype(np.uint8)
Image.fromarray(result).save(out, "WEBP", quality=88, method=6)
print(area, "done")
