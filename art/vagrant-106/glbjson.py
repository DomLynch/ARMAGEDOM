import json, struct, sys

def load(path):
    b = open(path, "rb").read()
    n = struct.unpack_from("<I", b, 12)[0]
    j = json.loads(b[20:20 + n])
    off = 20 + n
    bin_ = b""
    if off < len(b):
        m = struct.unpack_from("<I", b, off)[0]
        bin_ = b[off + 8: off + 8 + m]
    return j, bin_

if __name__ == "__main__":
    j, bn = load(sys.argv[1])
    print("extUsed", j.get("extensionsUsed"), "bin", len(bn))
    print("buffers", j.get("buffers"))
    print("images", [(i.get("mimeType"), j["bufferViews"][i["bufferView"]]["byteLength"] if "bufferView" in i else i.get("uri", "")[:30]) for i in j.get("images", [])])
    print("nodes", len(j["nodes"]), "skins", [(len(s["joints"])) for s in j.get("skins", [])])
    print("meshes", [(m["name"], [(list(p["attributes"].keys())) for p in m["primitives"]]) for m in j.get("meshes", [])][:12])
    print("anims", [(a["name"], len(a["channels"])) for a in j.get("animations", [])][:8])
    if len(sys.argv) > 2:
        for i, n in enumerate(j["nodes"][:int(sys.argv[2])]):
            print(i, {k: v for k, v in n.items() if k != "extras"})
