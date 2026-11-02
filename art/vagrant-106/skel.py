import json, sys
import numpy as np
from glbjson import load

def qmat(q):
    x, y, z, w = q
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                     [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                     [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])

def local(n):
    m = np.eye(4)
    if "matrix" in n:
        return np.array(n["matrix"]).reshape(4, 4).T
    s = np.array(n.get("scale", [1, 1, 1]))
    m[:3, :3] = qmat(n.get("rotation", [0, 0, 0, 1])) * s
    m[:3, 3] = n.get("translation", [0, 0, 0])
    return m

def worlds(j):
    nodes = j["nodes"]
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get("children", []):
            parent[c] = i
    W = {}
    def w(i):
        if i in W:
            return W[i]
        W[i] = (w(parent[i]) if i in parent else np.eye(4)) @ local(nodes[i])
        return W[i]
    for i in range(len(nodes)):
        w(i)
    return W, parent

if __name__ == "__main__":
    j, _ = load(sys.argv[1])
    W, parent = worlds(j)
    names = j["nodes"]
    joints = j["skins"][0]["joints"] if j.get("skins") else range(len(names))
    print("joints", len(joints))
    for i in joints:
        n = names[i]
        kids = [names[c]["name"] for c in n.get("children", [])]
        print(i, n["name"], "parent", names[parent[i]]["name"] if i in parent else None, "pos", np.round(W[i][:3, 3], 3).tolist(), "kids", len(kids))
