"""Paint the wet, scarred, spiky roach atlas and repack the GLB (texture + roughness only; rig, mesh and clips untouched)."""
import json, struct, io, sys
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

SRC = "original-roach.glb"
OUT = sys.argv[1] if len(sys.argv) > 1 else "roach-wet.glb"
W = H = 512
BW = 128
rng = np.random.default_rng(2710)


def fbm(w, h, octaves=((8, 1.0), (16, 0.5), (32, 0.25), (64, 0.12))):
    acc = np.zeros((h, w), np.float32)
    tot = 0.0
    for cells, amp in octaves:
        g = rng.random((max(2, cells * h // w), cells)).astype(np.float32)
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        acc += np.asarray(im, np.float32) / 255.0 * amp
        tot += amp
    acc /= tot
    return (acc - acc.min()) / (acc.max() - acc.min() + 1e-6)


def lerp(a, b, t):
    a = np.array(a, np.float32)
    b = np.array(b, np.float32)
    return a + (b - a) * t[..., None]


def grit(img, amt):
    n = rng.normal(0, amt, img.shape[:2]).astype(np.float32)
    return img + n[..., None]


def scars(img, n, col, alpha, maxlen):
    pil = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    lay = Image.new("L", pil.size, 0)
    d = ImageDraw.Draw(lay)
    for _ in range(n):
        x, y = rng.integers(0, pil.size[0]), rng.integers(0, pil.size[1])
        a = rng.uniform(0, np.pi)
        ln = rng.uniform(min(6, maxlen), maxlen)
        d.line([x, y, x + np.cos(a) * ln, y + np.sin(a) * ln], fill=255, width=1)
    lay = lay.filter(ImageFilter.GaussianBlur(0.5))
    m = np.asarray(lay, np.float32)[..., None] / 255.0 * alpha
    return img * (1 - m) + np.array(col, np.float32) * m


def shell():
    t = fbm(BW, H)
    img = lerp((28, 19, 15), (84, 60, 40), t)
    purple = np.clip((fbm(BW, H) - 0.66) * 5, 0, 1)
    img = img * (1 - purple[..., None] * 0.6) + np.array((116, 50, 46), np.float32) * purple[..., None] * 0.6
    olive = np.clip((fbm(BW, H) - 0.72) * 6, 0, 1)
    img = img * (1 - olive[..., None] * 0.55) + np.array((122, 112, 44), np.float32) * olive[..., None] * 0.55
    grime = np.clip((fbm(BW, H) - 0.55) * 3, 0, 1)
    img = img * (1 - grime[..., None] * 0.55) + np.array((18, 14, 12), np.float32) * grime[..., None] * 0.55
    img = grit(img, 9)
    img = scars(img, 70, (170, 138, 100), 0.55, 40)
    img = scars(img, 40, (16, 11, 9), 0.7, 26)
    streak = fbm(BW, H, ((2, 1.0), (4, 0.5)))
    wet = np.clip((streak - 0.62) * 5, 0, 1)
    img = img * (1 - wet[..., None] * 0.2) + np.array((170, 142, 104), np.float32) * wet[..., None] * 0.2
    return img


def spines():
    img = np.zeros((H, BW, 3), np.float32)
    ring = (np.sin(np.arange(H) / 7.5) > 0.1).astype(np.float32)[:, None] * np.ones((1, BW), np.float32)
    ring = ring * (0.75 + 0.25 * fbm(BW, H))
    img = lerp((22, 13, 10), (132, 84, 38), ring)
    img = grit(img, 8)
    return scars(img, 25, (210, 160, 90), 0.5, 18)


def legs():
    t = fbm(BW, H)
    img = lerp((40, 24, 18), (92, 58, 38), t)
    seg = (np.sin(np.arange(H) / 18.0) > 0.55).astype(np.float32)[:, None] * np.ones((1, BW), np.float32)
    img = img * (1 - seg[..., None] * 0.4) + np.array((178, 128, 76), np.float32) * seg[..., None] * 0.4
    img = grit(img, 8)
    img = scars(img, 40, (190, 140, 88), 0.55, 24)
    return scars(img, 25, (14, 9, 8), 0.7, 18)


def eyes():
    img = lerp((8, 6, 6), (28, 22, 22), fbm(BW, H))
    img = grit(img, 3)
    return scars(img, 6, (200, 190, 180), 0.8, 5)


atlas = np.zeros((H, W, 3), np.float32)
for i, f in enumerate((shell, spines, legs, eyes)):
    atlas[:, i * BW:(i + 1) * BW] = f()
buf = io.BytesIO()
Image.fromarray(np.clip(atlas, 0, 255).astype(np.uint8)).save(buf, "WEBP", quality=82, method=6)
img_bytes = buf.getvalue()
Image.fromarray(np.clip(atlas, 0, 255).astype(np.uint8)).save("atlas-new.png")
print("webp bytes", len(img_bytes))

d = open(SRC, "rb").read()
jl = struct.unpack("<I", d[12:16])[0]
j = json.loads(d[20:20 + jl])
bin_off = 20 + jl + 8
binary = d[bin_off:bin_off + j["buffers"][0]["byteLength"]]
old_len = j["bufferViews"][0]["byteLength"]
rest = binary[(old_len + 3) // 4 * 4:]
pad = (-len(img_bytes)) % 4
new_bin = img_bytes + b"\0" * pad + rest
delta = (len(img_bytes) + pad) - (old_len + 3) // 4 * 4
j["bufferViews"][0]["byteLength"] = len(img_bytes)
for bv in j["bufferViews"][1:]:
    e = bv["extensions"]["EXT_meshopt_compression"]
    e["byteOffset"] += delta
j["buffers"][0]["byteLength"] = len(new_bin)
j["materials"][0]["pbrMetallicRoughness"]["roughnessFactor"] = 0.42
js = json.dumps(j, separators=(",", ":")).encode()
js += b" " * ((-len(js)) % 4)
new_bin += b"\0" * ((-len(new_bin)) % 4)
total = 12 + 8 + len(js) + 8 + len(new_bin)
out = struct.pack("<4sII", b"glTF", 2, total)
out += struct.pack("<I4s", len(js), b"JSON") + js
out += struct.pack("<I4s", len(new_bin), b"BIN\0") + new_bin
open(OUT, "wb").write(out)
print(OUT, len(out), "was", len(d))
