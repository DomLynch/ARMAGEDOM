"""paint.py <area> <mask.json> <out.webp>: LaMa-inpaint the masked painted objects out of the area's phone backdrop.

The mask polygons are in full-image pixels. Only the dilated mask is replaced (feathered), the rest of the picture is untouched; the
result is saved as lossy WebP at the same size. Run with the vlama venv (torch + simple-lama-inpainting)."""
import json, sys
import cv2
import numpy as np
from PIL import Image
from simple_lama_inpainting import SimpleLama

root = "/Users/domininclynch/Developer/armagedom/.claude/worktrees/arma-chars-f7f72b"
area, mask_file, out = sys.argv[1:4]
src = Image.open(sys.argv[4] if len(sys.argv) > 4 else f"{root}/Web/public/world/{area}/backdrop-phone.webp").convert("RGB")  # optional 4th argument: the source picture
w, h = src.size
mask = np.zeros((h, w), np.uint8)
for poly in json.load(open(mask_file)):
    cv2.fillPoly(mask, [np.array(poly, np.int32)], 255)
mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17)))
ys, xs = np.where(mask > 0)
pad = 96
x0, x1 = max(0, xs.min() - pad), min(w, xs.max() + pad)
y0, y1 = max(0, ys.min() - pad), min(h, ys.max() + pad)
crop = src.crop((x0, y0, x1, y1))
cm = Image.fromarray(mask[y0:y1, x0:x1])
filled = SimpleLama()(crop, cm).crop((0, 0, x1 - x0, y1 - y0))
soft = cv2.GaussianBlur(mask[y0:y1, x0:x1], (0, 0), 3).astype(np.float32)[..., None] / 255
base = np.asarray(crop).astype(np.float32)
mix = base * (1 - soft) + np.asarray(filled).astype(np.float32) * soft
result = np.asarray(src).copy()
result[y0:y1, x0:x1] = np.clip(mix + 0.5, 0, 255).astype(np.uint8)
Image.fromarray(result).save(out, "WEBP", quality=88, method=6)
print(area, "mask px", int((mask > 0).sum()), "box", (x0, y0, x1, y1))
