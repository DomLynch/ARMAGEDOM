"""Turns elephant_mesh.npz into the JSON elephant_swap.mjs reads, and the two PNG atlases into WebP.
Run: python3 elephant_pack.py elephant_mesh.npz colour.png emissive.png out.json colour.webp emissive.webp"""
import json, sys
import numpy as np
from PIL import Image

npz, colour, emissive, out_json, out_c, out_e = sys.argv[1:7]
d = np.load(npz)
json.dump(
    {
        "pos": d["pos"].round(5).flatten().tolist(),
        "nor": d["nor"].round(4).flatten().tolist(),
        "uv": d["uv"].round(5).flatten().tolist(),
        "jidx": d["jidx"].flatten().tolist(),
        "jw": d["jw"].round(4).flatten().tolist(),
        "tris": d["tris"].flatten().tolist(),
        "joints": [str(j) for j in d["joints"]],
    },
    open(out_json, "w"),
)
Image.open(colour).convert("RGB").save(out_c, "WEBP", quality=90, method=6)
Image.open(emissive).convert("RGB").save(out_e, "WEBP", quality=90, method=6)
print("PACKED")
