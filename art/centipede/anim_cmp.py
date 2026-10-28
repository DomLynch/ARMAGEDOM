import json, struct, sys


def load(p):
    d = open(p, "rb").read()
    l = struct.unpack("<I", d[12:16])[0]
    return json.loads(d[20:20 + l])


def info(j):
    acc = j["accessors"]
    out = {}
    for a in j["animations"]:
        t = max(acc[s["input"]]["max"][0] for s in a["samplers"])
        out[a["name"]] = (round(t, 3), len(a["channels"]))
    return out, sorted(j["nodes"][i]["name"] for i in j["skins"][0]["joints"])


a, ja = info(load(sys.argv[1]))
b, jb = info(load(sys.argv[2]))
print("orig", a)
print("new ", b)
print("joints equal", ja == jb, len(ja), len(jb))
