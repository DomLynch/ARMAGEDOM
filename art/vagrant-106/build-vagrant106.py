"""Vagrant (19-joint WardenRig) -> the Pitborn hunter's 106-joint Mixamo rig, with the hunter's 16 donor-knife clips. numpy only, CPU.

Derived from art/rig106-pilot/build106.py (PR #381). What differs from the pilot:
  - the template is hunters/hunter-pitborn-106.glb (decoded), not the X Bot file: its skeleton, bind pose and its 16 clips
    (Armed, ArmedWalk, Run, Attack, Return, Riposte, Heavy, Guard, Roll, Hit, Death, Parry, BlockImpact, Deflected, StrafeLeft,
    StrafeRight) are what donor-motion.js already plays for the marked hunter, so clip names, durations and the no-shield
    knife poses are the game's own. Rotation tracks are copied verbatim; the Hips translation is rescaled to the vagrant's legs.
  - the machete is no longer a skinned mesh on the hand: it is baked as a plain mesh under fk_socket_hand_r / WeaponDrawn, the same
    way the Pitborn cleaver is, in the socket's frame (blade along +Y, grip at the origin).

usage: python3 build-vagrant106.py <vagrant_decoded.glb> <hunter106_decoded.glb> <out.glb> <lean|full>

Method (one-mold, same as the 108 OpenTrident bodies):
  1. Re-pose the vagrant meshes into the template's T-pose by linear blend skinning with per-limb
     rotations (Arm, ForeArm, Hand, UpLeg, Leg, Foot aligned to the template's limb directions).
  2. Keep the template's node tree, rest rotations and scales (so every Mixamo clip plays unchanged);
     only joint translations are refit: mapped joints take the vagrant joint positions, the rest are
     placed relative to their nearest mapped ancestor, scaled by that segment's length ratio.
  3. Remap skin weights vagrant joint -> mixamorig joint (Chest -> Spine2, Clavicle -> Shoulder, ...).
  4. Attach clips: rotation tracks verbatim, Hips converted to the body frame (Rx 180), Hips
     translation fitted so the feet stay planted (affine on height, scale on travel).
  full = all 106 joints skinned and animated. lean = only the 19 weighted joints are skin joints and
  only they plus their ancestors carry animation channels (same bone names, same clips).
"""
import json, struct, sys
import numpy as np
from glbjson import load
from skel import qmat, local, worlds

VMAP = {
    "Hips": "Hips", "Spine": "Spine", "Chest": "Spine2", "Neck": "Neck", "Head": "Head",
    "Clavicle.L": "LeftShoulder", "UpperArm.L": "LeftArm", "Forearm.L": "LeftForeArm", "Hand.L": "LeftHand",
    "Clavicle.R": "RightShoulder", "UpperArm.R": "RightArm", "Forearm.R": "RightForeArm", "Hand.R": "RightHand",
    "Thigh.L": "LeftUpLeg", "Shin.L": "LeftLeg", "Foot.L": "LeftFoot",
    "Thigh.R": "RightUpLeg", "Shin.R": "RightLeg", "Foot.R": "RightFoot",
}
LIMB = {  # vagrant joint -> template joint it points at (target limb direction)
    "UpperArm.L": "LeftForeArm", "Forearm.L": "LeftHand", "Hand.L": "LeftHandMiddle1",
    "UpperArm.R": "RightForeArm", "Forearm.R": "RightHand", "Hand.R": "RightHandMiddle1",
    "Thigh.L": "LeftLeg", "Shin.L": "LeftFoot", "Foot.L": "LeftToeBase",
    "Thigh.R": "RightLeg", "Shin.R": "RightFoot", "Foot.R": "RightToeBase",
}
PFX = "mixamorig:"
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
NORM = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}


def acc_read(j, b, i, deq=True):
    a = j["accessors"][i]
    bv = j["bufferViews"][a["bufferView"]]
    ct, n, cnt = CT[a["componentType"]], NC[a["type"]], a["count"]
    isz = np.dtype(ct).itemsize * n
    stride = bv.get("byteStride") or isz
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    raw = np.frombuffer(b, np.uint8, stride * (cnt - 1) + isz, off)
    ix = np.arange(cnt)[:, None] * stride + np.arange(isz)[None, :]
    out = raw[ix].copy().view(ct).reshape(cnt, n)
    if deq and a.get("normalized"):
        out = np.maximum(out.astype(np.float64) / NORM[a["componentType"]], -1.0)
    return out


def qmul(a, b):
    ax, ay, az, aw = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    bx, by, bz, bw = b[..., 0], b[..., 1], b[..., 2], b[..., 3]
    return np.stack([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz], -1)


def min_rot(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); s = np.linalg.norm(v); c = float(a @ b)
    if s < 1e-9:
        return np.eye(3)
    k = v / s
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    ang = np.arctan2(s, c)
    return np.eye(3) + np.sin(ang) * K + (1 - np.cos(ang)) * (K @ K)


class Out:
    def __init__(self):
        self.bin = bytearray(); self.views = []; self.accs = []

    def view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        v = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target:
            v["target"] = target
        self.bin += data
        self.views.append(v)
        return len(self.views) - 1

    def acc(self, arr, ctype, atype, target=None, minmax=False):
        arr = np.ascontiguousarray(arr.astype(CT[ctype]))
        a = {"bufferView": self.view(arr.tobytes(), target), "componentType": ctype, "count": int(arr.shape[0]), "type": atype}
        if minmax:
            a["min"] = arr.min(0).astype(float).tolist(); a["max"] = arr.max(0).astype(float).tolist()
        self.accs.append(a)
        return len(self.accs) - 1


def main():
    vpath, tpath, opath, mode = sys.argv[1:5]
    V, vb = load(vpath); T, tb = load(tpath)
    Wv, par_v = worlds(V); Wt, par_t = worlds(T)
    vn = {n["name"]: i for i, n in enumerate(V["nodes"])}
    tn = {n["name"]: i for i, n in enumerate(T["nodes"])}
    tname = lambda m: PFX + m
    Pv = {k: Wv[vn[k]][:3, 3].copy() for k in VMAP}
    Av = {k: Wv[vn[k]][:3, :3] @ np.array([0, 1.0, 0]) for k in VMAP}
    Pt = lambda m: Wt[tn[m if m in tn else PFX + m]][:3, 3].copy()

    # ---- 1. T-pose rotations and fitted vagrant joint positions
    R = {k: np.eye(3) for k in VMAP}
    for k, tgt in LIMB.items():
        a_start = Pt(VMAP[k] if VMAP[k] in tn else PFX + VMAP[k])
        d = Pt(tgt) - a_start
        R[k] = min_rot(Av[k], d)
    pos = {}
    vparent = {}
    for k in VMAP:
        i = vn[k]
        vparent[k] = V["nodes"][par_v[i]]["name"] if i in par_v and V["nodes"][par_v[i]]["name"] in VMAP else None
    def fit(k):
        if k in pos:
            return pos[k]
        p = vparent[k]
        pos[k] = Pv[k].copy() if p is None else fit(p) + R[p] @ (Pv[k] - Pv[p])
        return pos[k]
    for k in VMAP:
        fit(k)

    # ---- 2. template fit
    tpos = {}
    for k, m in VMAP.items():
        tpos[PFX + m] = pos[k]
    def seglen(a, b): return np.linalg.norm(pos[a] - pos[b])
    def tseg(a, b): return np.linalg.norm(Pt(a) - Pt(b))
    sc = {
        "Hips": seglen("Thigh.L", "Thigh.R") / tseg("LeftUpLeg", "RightUpLeg"),
        "Spine": seglen("Neck", "Spine") / tseg("Neck", "Spine"),
        "Spine2": seglen("Neck", "Chest") / max(tseg("Neck", "Spine2"), 1e-6),
        "Neck": seglen("Head", "Neck") / tseg("Head", "Neck"),
        "Head": seglen("Head", "Neck") / tseg("Head", "Neck"),
        "LeftShoulder": seglen("UpperArm.L", "Forearm.L") / tseg("LeftArm", "LeftForeArm"),
        "LeftArm": seglen("UpperArm.L", "Forearm.L") / tseg("LeftArm", "LeftForeArm"),
        "LeftForeArm": seglen("Forearm.L", "Hand.L") / tseg("LeftForeArm", "LeftHand"),
        "LeftHand": seglen("Forearm.L", "Hand.L") / tseg("LeftForeArm", "LeftHand"),
        "RightShoulder": seglen("UpperArm.R", "Forearm.R") / tseg("RightArm", "RightForeArm"),
        "RightArm": seglen("UpperArm.R", "Forearm.R") / tseg("RightArm", "RightForeArm"),
        "RightForeArm": seglen("Forearm.R", "Hand.R") / tseg("RightForeArm", "RightHand"),
        "RightHand": seglen("Forearm.R", "Hand.R") / tseg("RightForeArm", "RightHand"),
        "LeftUpLeg": seglen("Thigh.L", "Shin.L") / tseg("LeftUpLeg", "LeftLeg"),
        "LeftLeg": seglen("Shin.L", "Foot.L") / tseg("LeftLeg", "LeftFoot"),
        "LeftFoot": seglen("Shin.L", "Foot.L") / tseg("LeftLeg", "LeftFoot"),
        "RightUpLeg": seglen("Thigh.R", "Shin.R") / tseg("RightUpLeg", "RightLeg"),
        "RightLeg": seglen("Shin.R", "Foot.R") / tseg("RightLeg", "RightFoot"),
        "RightFoot": seglen("Shin.R", "Foot.R") / tseg("RightLeg", "RightFoot"),
    }
    IKANCHOR = {"ik_foot_l": "LeftFoot", "ik_foot_r": "RightFoot", "ik_hand_l": "LeftHand", "ik_hand_r": "RightHand", "ik_hand_gun": "RightHand"}
    def anchor(i):
        n = T["nodes"][i]["name"]
        if n in IKANCHOR:
            return tn[PFX + IKANCHOR[n]]
        while i in par_t:
            i = par_t[i]
            if T["nodes"][i]["name"] in tpos:
                return i
        return None
    new_pos = {}
    for i, n in enumerate(T["nodes"]):
        nm = n["name"]
        Wi = Wt[i][:3, 3]
        if nm in tpos:
            new_pos[i] = tpos[nm]
        elif nm == PFX + "Spine1":
            a, b = tpos[PFX + "Spine"], tpos[PFX + "Spine2"]
            ta, tb_ = Pt("Spine"), Pt("Spine2")
            t = float((Wi - ta) @ (tb_ - ta) / ((tb_ - ta) @ (tb_ - ta)))
            new_pos[i] = a + t * (b - a)
        else:
            a = anchor(i)
            if a is None:
                new_pos[i] = Wi.copy()
            else:
                an = T["nodes"][a]["name"][len(PFX):]
                s = sc.get(an, 1.0)
                new_pos[i] = tpos[T["nodes"][a]["name"]] + s * (Wi - Wt[a][:3, 3])
    # locals from template rotations/scales and new positions
    Wnew = {}
    nodes_out = []
    skip = set()
    keepn = None
    if mode == "lean":  # drop every node that is not a weighted joint, an ancestor of one, or a weapon socket
        keepn = set()
        for i, n in enumerate(T["nodes"]):
            if n["name"] in set(tname(VMAP[k]) for k in VMAP) or n["name"].startswith("fk_socket") or n["name"] in ("SwordDrawn", "SwordSheathed"):
                j_ = i
                keepn.add(j_)
                while j_ in par_t:
                    j_ = par_t[j_]; keepn.add(j_)
    for i, n in enumerate(T["nodes"]):
        if "mesh" in n or n["name"].startswith("Layer_") or (keepn is not None and i not in keepn):
            skip.add(i)
    remap = {}
    for i in range(len(T["nodes"])):
        if i not in skip:
            remap[i] = len(remap)
    def lin(i):
        L = local(T["nodes"][i])
        return L[:3, :3]
    def getW(i):
        if i in Wnew:
            return Wnew[i]
        L3 = lin(i)
        if i in par_t:
            Pw = getW(par_t[i])
            lt = np.linalg.inv(Pw[:3, :3]) @ (new_pos[i] - Pw[:3, 3])
            M = np.eye(4); M[:3, :3] = Pw[:3, :3] @ L3; M[:3, 3] = new_pos[i]
        else:
            lt = new_pos[i].copy()
            M = np.eye(4); M[:3, :3] = L3; M[:3, 3] = new_pos[i]
        Wnew[i] = M
        return M
    for i in range(len(T["nodes"])):
        getW(i)
    for i, n in enumerate(T["nodes"]):
        if i in skip:
            continue
        o = {"name": n["name"]}
        if "rotation" in n: o["rotation"] = n["rotation"]
        if "scale" in n: o["scale"] = n["scale"]
        if i in par_t:
            Pw = Wnew[par_t[i]]
            o["translation"] = (np.linalg.inv(Pw[:3, :3]) @ (new_pos[i] - Pw[:3, 3])).tolist()
        else:
            o["translation"] = new_pos[i].tolist()
        ch = [remap[c] for c in n.get("children", []) if c in remap]
        if ch: o["children"] = ch
        nodes_out.append(o)

    # ---- 3. skin + weights
    vjoints = V["skins"][0]["joints"]
    vjname = [V["nodes"][x]["name"] for x in vjoints]
    tjoints = T["skins"][0]["joints"]
    if mode == "lean":
        out_joint_nodes = [tn[tname(VMAP[k])] for k in vjname]
    else:
        out_joint_nodes = list(tjoints)
    jindex = {nd: ix for ix, nd in enumerate(out_joint_nodes)}
    jmap = np.array([jindex[tn[tname(VMAP[k])]] for k in vjname], dtype=np.int64)
    ibm = np.stack([np.linalg.inv(Wnew[nd]).T.astype(np.float32) for nd in out_joint_nodes])

    O = Out()
    # copy images (bufferViews) and materials/textures verbatim
    images = []
    for im in V.get("images", []):
        bv = V["bufferViews"][im["bufferView"]]
        d = vb[bv.get("byteOffset", 0): bv.get("byteOffset", 0) + bv["byteLength"]]
        o = {k: v for k, v in im.items() if k != "bufferView"}
        o["bufferView"] = O.view(bytes(d))
        images.append(o)
    meshes = []
    mesh_nodes = []
    stats = {"tris": 0}
    lo = np.array([1e9] * 3); hi = -lo
    skinned = {}
    for mi, m in enumerate(V["meshes"]):
        for p in m["primitives"]:
            at = p["attributes"]
            P = acc_read(V, vb, at["POSITION"]).astype(np.float64)
            N = acc_read(V, vb, at["NORMAL"]).astype(np.float64)
            Jn = acc_read(V, vb, at["JOINTS_0"]).astype(np.int64)
            Wn = acc_read(V, vb, at["WEIGHTS_0"]).astype(np.float64)
            Wn = Wn / np.maximum(Wn.sum(1, keepdims=True), 1e-9)
            P2 = np.zeros_like(P); N2 = np.zeros_like(N)
            for c in range(4):
                for jj in np.unique(Jn[:, c]):
                    sel = (Jn[:, c] == jj) & (Wn[:, c] > 0)
                    if not sel.any(): continue
                    k = vjname[jj]; Rk = R[k]
                    P2[sel] += Wn[sel, c, None] * ((P[sel] - Pv[k]) @ Rk.T + pos[k])
                    N2[sel] += Wn[sel, c, None] * (N[sel] @ Rk.T)
            skinned[id(p)] = (P2, N2)
    # ---- weapon: the machete (T-posed, blade pointing down in the vagrant's rest pose) goes into fk_socket_hand_r's frame,
    # the frame the Pitborn cleaver uses: grip at the origin, blade along +Y, flat-face normal along Z.
    mp = {m["name"]: m["primitives"][0] for m in V["meshes"]}
    print("meshes", list(mp))
    WEAPON = ("Machete", "Machete handle")
    if not all(w in mp for w in WEAPON):
        raise SystemExit("vagrant has no machete meshes")
    Pb, Nb = skinned[id(mp["Machete"])]
    Ph, Nh = skinned[id(mp["Machete handle"])]
    c_h, c_b = Ph.mean(0), Pb.mean(0)
    u_m = (c_b - c_h) / np.linalg.norm(c_b - c_h)
    n_m = np.linalg.svd(Pb - c_b)[2][2]
    n_m -= (n_m @ u_m) * u_m
    n_m /= np.linalg.norm(n_m)
    Fm = np.stack([np.cross(u_m, n_m), u_m, n_m], 1)  # columns: local X, Y, Z expressed in vagrant T-pose space
    for nm in WEAPON:
        P2, N2 = skinned[id(mp[nm])]
        skinned[id(mp[nm])] = ((P2 - c_h) @ Fm, N2 @ Fm)
    wp = np.concatenate([skinned[id(mp[nm])][0] for nm in WEAPON])
    print("weapon local bbox lo", np.round(wp.min(0), 3).tolist(), "hi", np.round(wp.max(0), 3).tolist())
    weapon_meshes = []
    for mi, m in enumerate(V["meshes"]):
        prims = []
        is_weapon = m.get("name") in WEAPON
        for p in m["primitives"]:
            at = p["attributes"]
            UV = acc_read(V, vb, at["TEXCOORD_0"]).astype(np.float32)
            Jn = acc_read(V, vb, at["JOINTS_0"]).astype(np.int64)
            Wn = acc_read(V, vb, at["WEIGHTS_0"]).astype(np.float64)
            Wn = Wn / np.maximum(Wn.sum(1, keepdims=True), 1e-9)
            P2, N2 = skinned[id(p)]
            N2 = N2 / np.maximum(np.linalg.norm(N2, axis=1, keepdims=True), 1e-9)
            if not is_weapon:
                lo = np.minimum(lo, P2.min(0)); hi = np.maximum(hi, P2.max(0))
            J2 = jmap[Jn]
            idx = acc_read(V, vb, p["indices"], deq=False).reshape(-1)
            stats["tris"] += len(idx) // 3
            ia = O.acc(idx, 5125 if idx.max() > 65535 else 5123, "SCALAR", 34963)
            attrs = {
                "POSITION": O.acc(P2, 5126, "VEC3", 34962, True),
                "NORMAL": O.acc(N2, 5126, "VEC3", 34962),
                "TEXCOORD_0": O.acc(UV, 5126, "VEC2", 34962),
            }
            if not is_weapon:
                attrs["JOINTS_0"] = O.acc(J2, 5123, "VEC4", 34962)
                attrs["WEIGHTS_0"] = O.acc(Wn, 5126, "VEC4", 34962)
            prims.append({"attributes": attrs, "indices": ia, "material": p["material"], "mode": 4})
        (weapon_meshes if is_weapon else meshes).append({"name": m.get("name"), "primitives": prims})
    arm_idx = [i for i, n in enumerate(nodes_out) if n["name"] == "Armature"][0]
    root_idx = [i for i, n in enumerate(nodes_out) if n["name"] == "root"][0]
    for mi, m in enumerate(meshes):
        nodes_out.append({"name": m["name"], "mesh": mi, "skin": 0})
        mesh_nodes.append(len(nodes_out) - 1)
    nodes_out[arm_idx].setdefault("children", []).extend(mesh_nodes)
    # the weapon: WeaponDrawn (identity) under fk_socket_hand_r, one plain mesh child per machete part
    socket_ix = [i for i, n in enumerate(nodes_out) if n["name"] == "fk_socket_hand_r"][0]
    wkids = []
    for wm in weapon_meshes:
        meshes.append(wm)
        nodes_out.append({"name": "WeaponDrawn_" + str(len(wkids) + 1), "mesh": len(meshes) - 1})
        wkids.append(len(nodes_out) - 1)
    nodes_out.append({"name": "WeaponDrawn", "children": wkids})
    nodes_out[socket_ix].setdefault("children", []).append(len(nodes_out) - 1)
    skin_joint_ix = [remap[nd] for nd in out_joint_nodes]
    skin = {"name": "Skeleton106", "joints": skin_joint_ix, "inverseBindMatrices": O.acc(ibm.reshape(-1, 16), 5126, "MAT4"), "skeleton": root_idx}

    # ---- 4. animations
    Hips_t = tpos[tname("Hips")]
    foot_v = float(np.mean([pos["Foot.L"][1], pos["Foot.R"][1]]))
    foot_x = float(np.mean([Pt("LeftFoot")[1], Pt("RightFoot")[1]]))
    hips_x = float(Pt("Hips")[1])
    k_leg = (Hips_t[1] - foot_v) / (hips_x - foot_x)
    # which channels survive
    weighted = set(tname(VMAP[k]) for k in vjname)
    keep = None
    if mode == "lean":
        keep = set()
        for nm in weighted:
            i = tn[nm]
            keep.add(nm)
            while i in par_t:
                i = par_t[i]; keep.add(T["nodes"][i]["name"])
    name_to_new = {n["name"]: ix for ix, n in enumerate(nodes_out)}
    anims = []
    info = []
    # the hunter's own clips: same node names and frame as the output, so rotations are copied as they are
    hips_t_rest = np.array(T["nodes"][tn[tname("Hips")]]["translation"], dtype=np.float64)
    hips_new_rest = np.array([n for n in nodes_out if n["name"] == tname("Hips")][0]["translation"], dtype=np.float64)
    print("hips rest local template", np.round(hips_t_rest, 4).tolist(), "vagrant", np.round(hips_new_rest, 4).tolist())
    for A in T["animations"]:
        cname = A["name"]
        chans, samps = [], []
        for ch in A["channels"]:
            nm = T["nodes"][ch["target"]["node"]]["name"]
            if nm not in name_to_new or (keep is not None and nm not in keep):
                continue
            s = A["samplers"][ch["sampler"]]
            t = acc_read(T, tb, s["input"]).astype(np.float32).reshape(-1)
            v = acc_read(T, tb, s["output"]).astype(np.float64)
            path = ch["target"]["path"]
            if path == "rotation":
                v = v / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-12)
            elif path == "translation":
                if nm == tname("Hips"):
                    # offsets from the rest pose scale with the leg length ratio; the hips' vertical is local z (root is -90 about X)
                    v = hips_new_rest + (v - hips_t_rest) * k_leg
                else:
                    continue
            else:
                continue
            ti = O.acc(t, 5126, "SCALAR", None, True)
            vi = O.acc(v, 5126, "VEC4" if path == "rotation" else "VEC3")
            samps.append({"input": ti, "output": vi, "interpolation": "LINEAR"})
            chans.append({"sampler": len(samps) - 1, "target": {"node": name_to_new[nm], "path": path}})
        anims.append({"name": cname, "channels": chans, "samplers": samps})
        info.append((cname, len(chans), float(t.max())))

    gj = {
        "asset": {"version": "2.0", "generator": "armagedom rig106 pilot"},
        "scene": 0, "scenes": [{"name": "Scene", "nodes": [arm_idx]}],
        "nodes": nodes_out, "skins": [skin], "meshes": meshes, "animations": anims,
        "materials": V.get("materials", []), "textures": V.get("textures", []), "images": images,
        "samplers": V.get("samplers", []),
        "accessors": O.accs, "bufferViews": O.views, "buffers": [{"byteLength": len(O.bin)}],
        "extensionsUsed": V.get("extensionsUsed", []),
    }
    gj = {k: v for k, v in gj.items() if v != []}
    js = json.dumps(gj, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    bn = bytes(O.bin) + b"\0" * ((4 - len(O.bin) % 4) % 4)
    with open(opath, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bn)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack("<II", len(bn), 0x004E4942)); f.write(bn)
    print("OK", opath, "bytes", 12 + 16 + len(js) + len(bn), "joints", len(skin_joint_ix), "tris", stats["tris"],
          "bbox lo", np.round(lo, 3).tolist(), "hi", np.round(hi, 3).tolist(), "k_leg", round(k_leg, 4))
    for r in info: print("clip", r)


if __name__ == "__main__":
    main()
