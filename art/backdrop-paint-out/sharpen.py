"""sharpen.py <in.webp> <out.png> [sigma] [amount]
Luma-only unsharp mask with a halo limiter: chroma (Cr/Cb) is untouched, so the approved colour grade is kept; the sharpened luma is
clamped to the local min/max of the original (5x5, with a small overshoot allowance) so edges cannot ring into halos.
Used for lambeth as: sharpen.py <backdrop-phone.webp> sharp.png 1.1 0.9, then QUILT_DILATE=9 QUILT_TEXTURE=40 QUILT_MIXED=1
QUILT_PAINT_OPEN=5 QUILT_STEP=32 QUILT_P=64 quilt.py lambeth mask-lambeth.json src-lambeth.json <out.webp> sharp.png (one lossy save)."""
import sys
import cv2
import numpy as np
from PIL import Image

src, out = sys.argv[1:3]
sigma = float(sys.argv[3]) if len(sys.argv) > 3 else 1.1
amount = float(sys.argv[4]) if len(sys.argv) > 4 else 0.9
rgb = np.asarray(Image.open(src).convert("RGB"))
ycc = cv2.cvtColor(rgb, cv2.COLOR_RGB2YCrCb).astype(np.float32)
y = ycc[..., 0]
blur = cv2.GaussianBlur(y, (0, 0), sigma)
detail = y - blur
# Do not amplify tiny noise/compression texture: soft threshold the detail (dead zone of 1.5 levels).
detail = np.sign(detail) * np.maximum(np.abs(detail) - 1.5, 0)
sharp = y + amount * detail
k = np.ones((5, 5), np.uint8)
lo = cv2.erode(y, k) - 6
hi = cv2.dilate(y, k) + 6
sharp = np.clip(sharp, lo, hi)
ycc[..., 0] = np.clip(sharp, 0, 255)
res = cv2.cvtColor(np.round(ycc).astype(np.uint8), cv2.COLOR_YCrCb2RGB)
Image.fromarray(res).save(out)
print("sigma", sigma, "amount", amount, "mean abs change", float(np.abs(res.astype(np.int16) - rgb).mean()))
