"""East wolf look (texture and material only; mesh, skin, 31 bones and 7 clips untouched).

Each triangle owns a texel cell in the 512 atlas. We recolour every cell from the triangle's rest-pose position and bone:
scarred charcoal fur (pale healed scars, raw red wounds), cold frost on the guard hairs, sparse embers, red glowing eyes.
A second texture (emissive) carries the eyes, ember specks and a faint glow in the wounds. Run: python3 wolf_build.py out.glb"""
import io, json, math, struct, sys
import numpy as np
from PIL import Image, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else "wolf-east.glb"
d = json.load(open("wolf_polys.json"))
W, H = d["W"], d["H"]
polys = d["polys"]
rng = np.random.default_rng(2714)
alb = np.zeros((H, W, 3), np.float32)
emi = np.zeros((H, W, 3), np.float32)
# image rows: PIL row 0 is the top; glTF v=0 is the top. Blender gave us v up, so row = H-1-ty.
BODY = ("spine", "hind_up", "front_up", "neck", "tail")


def noise3(x, y, z, f):
    return 0.5 + 0.5 * math.sin(f * x + 1.7) * math.sin(f * y * 1.3 + 0.4) * math.sin(f * z * 0.9 + 2.1)


def lum(c):
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


eye_cells = 0
EYES = ((-0.0349, -0.3984, 0.4846), (0.0349, -0.3984, 0.4846))  # the one amber eye cell found in the old atlas, mirrored
areas = sorted(p[7] for p in polys)
BIG = areas[int(len(areas) * 0.9)]  # the largest tenth of the triangles: no scars, wounds or embers (a whole shard would glow)
print("area p50/p90", areas[len(areas) // 2], BIG)
for tx, ty, x, y, z, g, c, area in polys:
    row = H - 1 - ty
    big = area > BIG
    l_old = lum(c)
    base = 0.05 + 0.9 * min(0.35, l_old)  # keep the original per-triangle fur variation
    col = np.array((base * 0.95, base * 1.0, base * 1.12), np.float32)  # cold charcoal
    em = np.zeros(3, np.float32)
    # frost on the guard hairs: back and mane
    if z > 0.42 and g in ("spine2", "spine3", "neck", "spine4"):
        col *= 1.0 + 1.2 * noise3(x, y, z, 40)
    # belly shadow
    if z < 0.3 and g.startswith(BODY[:2]):
        col *= 0.7
    # scars: diagonal pale bands over flanks, shoulder, haunch, face
    if not big and g in ("spine1", "spine2", "front_up_L", "front_up_R", "hind_up_L", "hind_up_R", "head", "neck", "spine3"):
        t = math.sin(26 * (x * 0.8 + y * 1.1 + z * 0.5))
        s2 = math.sin(41 * (x * -0.6 + y * 0.9 - z * 0.7) + 1.3)
        if abs(t) < 0.06 and noise3(x, y, z, 17) > 0.35:
            col = np.array((0.46, 0.33, 0.30), np.float32) * (0.8 + 0.4 * noise3(x, y, z, 90))
            if noise3(x, y, z, 31) > 0.7:
                col = np.array((0.42, 0.07, 0.06), np.float32)  # raw wound
                em = np.array((0.30, 0.04, 0.02), np.float32)
        elif abs(s2) < 0.035 and noise3(x, y, z, 23) > 0.5:
            col = np.array((0.38, 0.28, 0.26), np.float32)
    # embers: a few cells on the back, mane and tail root glow
    if not big and g in ("spine2", "spine3", "spine4", "tail0", "neck") and z > 0.38 and rng.random() < 0.035:
        col = np.array((0.85, 0.28, 0.06), np.float32)
        em = np.array((0.75, 0.2, 0.03), np.float32)
    # mouth gums: the old red cells, darker and wetter
    if g in ("head", "jaw") and c[0] > 0.5 and c[1] < 0.3:
        col = np.array((0.30, 0.03, 0.04), np.float32)
    # eyes: the warm cells at the front of the head
    if g == "head" and any(math.dist((x, y, z), ec) < 0.0135 for ec in EYES):
        col = np.array((0.95, 0.04, 0.02), np.float32)
        em = np.array((1.0, 0.1, 0.04), np.float32)
        eye_cells += 1
    alb[row, tx] = np.clip(col, 0, 1)
    emi[row, tx] = np.clip(em, 0, 1)
print("eye cells", eye_cells)


def fill_gaps(a):
    """Cells without a triangle copy their left neighbour so bilinear sampling never bleeds black."""
    mask = (a.sum(-1) > 0).astype(np.uint8)
    out = a.copy()
    for _ in range(2):
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sh = np.roll(np.roll(out, dy, 0), dx, 1)
            sm = np.roll(np.roll(mask, dy, 0), dx, 1)
            take = (mask == 0) & (sm == 1)
            out[take] = sh[take]
            mask = np.where(take, 1, mask)
    return out


alb = fill_gaps(alb)
a8 = (np.clip(alb, 0, 1) * 255).astype(np.uint8)
e8 = (np.clip(emi, 0, 1) * 255).astype(np.uint8)
Image.fromarray(a8).save("wolf-albedo-new.png")
Image.fromarray(e8).save("wolf-emissive-new.png")


def webp(arr, q):
    b = io.BytesIO()
    Image.fromarray(arr).save(b, "WEBP", quality=q, method=6, lossless=False)
    return b.getvalue()


alb_b = webp(a8, 92)
emi_b = webp(e8, 92)
print("webp bytes", len(alb_b), len(emi_b))

g = open("wolf.glb", "rb").read()
jl = struct.unpack("<I", g[12:16])[0]
j = json.loads(g[20:20 + jl])
bin_off = 20 + jl + 8
binary = g[bin_off:bin_off + j["buffers"][0]["byteLength"]]
old_len = j["bufferViews"][0]["byteLength"]
rest = binary[(old_len + 3) // 4 * 4:]
pad = (-len(alb_b)) % 4
new_bin = alb_b + b"\0" * pad + rest
delta = len(alb_b) + pad - (old_len + 3) // 4 * 4
j["bufferViews"][0]["byteLength"] = len(alb_b)
for bv in j["bufferViews"][1:]:
    e = bv.get("extensions", {}).get("EXT_meshopt_compression")
    if e:
        e["byteOffset"] += delta
new_bin += b"\0" * ((-len(new_bin)) % 4)
emi_off = len(new_bin)
new_bin += emi_b + b"\0" * ((-len(emi_b)) % 4)
j["bufferViews"].append({"buffer": 0, "byteOffset": emi_off, "byteLength": len(emi_b)})
j["images"].append({"name": "WorldEmissive", "mimeType": "image/webp", "bufferView": len(j["bufferViews"]) - 1})
j["textures"].append({"sampler": j["textures"][0]["sampler"], "extensions": {"EXT_texture_webp": {"source": len(j["images"]) - 1}}})
mat = j["materials"][0]
mat["emissiveTexture"] = {"index": len(j["textures"]) - 1}
mat["emissiveFactor"] = [1.0, 1.0, 1.0]
mat["pbrMetallicRoughness"]["roughnessFactor"] = 0.62
j["buffers"][0]["byteLength"] = len(new_bin)
js = json.dumps(j, separators=(",", ":")).encode()
js += b" " * ((-len(js)) % 4)
total = 12 + 8 + len(js) + 8 + len(new_bin)
out = struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(new_bin), b"BIN\0") + new_bin
open(OUT, "wb").write(out)
print(OUT, len(out), "was", len(g))
