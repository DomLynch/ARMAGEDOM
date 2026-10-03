"""CPU authoring: CC0 anatomy fitted to immutable Warden rig, modular workwear.

Run in an isolated job containing inputs/rig.blend and inputs/donor.npz.
Output is always a separate candidate; no original is overwritten.
"""
from pathlib import Path
import math
import json
import hashlib
import bpy
import numpy as np
from mathutils import Vector, Quaternion
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "output"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT / "inputs/rig.blend"), use_scripts=False)
scene = bpy.context.scene
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
rig.data.pose_position = "REST"
bone_names = [b.name for b in rig.data.bones]
rest_matrices = {b.name: np.array(b.matrix_local).tolist() for b in rig.data.bones}
for o in list(bpy.data.objects):
    if o.type == "MESH":
        bpy.data.objects.remove(o, do_unlink=True)

donor = np.load(ROOT / "inputs/donor.npz")
source = donor["positions"].astype(float)
tris = donor["triangles"]
source_weights = donor["weights"].astype(float)
names = list(donor["names"])
mapping = {"Root": "Hips", "pelvis": "Hips", "spine_01": "Spine",
           "spine_02": "Spine", "spine_03": "Chest", "neck_01": "Neck", "head": "Head"}
for side in "lr":
    for a, b in [("clavicle", "Clavicle"), ("upperarm", "UpperArm"),
                 ("lowerarm", "Forearm"), ("hand", "Hand"), ("thigh", "Thigh"),
                 ("calf", "Shin"), ("foot", "Foot"), ("ball", "Foot")]:
        mapping[a + "_" + side] = b + "." + side.upper()
    for n in names:
        if n.endswith("_" + side) and n not in mapping:
            mapping[n] = "Hand." + side.upper()

# Anatomy-aware weighted fit. Torso uses shared continuous landmarks, while limbs
# use the donor's own weighted bones and target segments. No target bind is edited.
fitted = np.zeros_like(source)
weights = np.zeros((len(source), len(bone_names)))
for i, name in enumerate(names):
    target = mapping[name]
    w = source_weights[:, i]
    weights[:, bone_names.index(target)] += w
    if target in ("Hips", "Spine", "Chest", "Neck", "Head"):
        transformed = source.copy()
        transformed[:, 0:2] *= 1.14
        transformed[:, 1] += .035
        transformed[:, 2] = np.interp(source[:, 2],
            [0, .909, .995, 1.123, 1.461, 1.557, 1.711],
            [0, .98, 1.15, 1.38, 1.57, 1.70, 1.94])
    else:
        base = name
        side = name[-1]
        if target.startswith("Hand"):
            base = "hand_" + side
        if name.startswith("ball"):
            base = "foot_" + side
        j = names.index(base)
        sh, st = Vector(donor["heads"][j]), Vector(donor["tails"][j])
        tb = rig.data.bones[target]
        th, tt = tb.head_local, tb.tail_local
        if target.startswith("Hand"):
            # Use wrist-to-middle-finger direction, not MPFB's tiny hand segment.
            tip = donor["tails"][names.index("middle_03_" + side)]
            st = Vector(tip)
        rotation = np.array((st - sh).rotation_difference(tt - th).to_matrix())
        scale = (tt - th).length / (st - sh).length
        if target.startswith("Hand"):
            scale = 1.14
        relative = source - np.array(sh)
        axis = np.array((st - sh).normalized())
        longitudinal = (relative @ axis)[:, None] * axis
        # Diagnostic: target arm joint sits higher than donor; transverse skin inflation
        # plus shell offset produced a padded shoulder. Slim transverse flesh while
        # preserving joint positions and longitudinal reach.
        transformed = (longitudinal * scale + (relative - longitudinal) * (0.86 if target.startswith(("Clavicle", "UpperArm", "Forearm")) else 1.14)) @ rotation.T + np.array(th)
    fitted += transformed * w[:, None]

# Diagnostic alternative: independent bone transforms fold the shoulder surface
# because knight clavicle pivots are higher than the human neck base. A cubic
# radial-basis warp is continuous across those weight boundaries. Skin landmarks
# may sit below unchanged pivots; skeleton, bindings and clips are immutable.
control_source, control_target = [], []
control_pairs = [("pelvis", "Hips"), ("spine_01", "Spine"),
                 ("spine_03", "Chest"), ("neck_01", "Neck"), ("head", "Head")]
for side in "lr":
    control_pairs += [(a + "_" + side, b + "." + side.upper())
                     for a, b in (("upperarm", "UpperArm"), ("lowerarm", "Forearm"),
                                  ("hand", "Hand"), ("thigh", "Thigh"),
                                  ("calf", "Shin"), ("foot", "Foot"))]
for name, target in control_pairs:
    control_source.append(donor["heads"][names.index(name)])
    point = np.array(rig.data.bones[target].head_local)
    if target.startswith("UpperArm"):
        point[2] = 1.50  # human shoulder flesh below knight pivot
    control_target.append(point)
control_source.append(donor["tails"][names.index("head")])
control_target.append(np.array(rig.data.bones["Head"].tail_local))
for side in "lr":
    control_source.append(donor["tails"][names.index("middle_03_" + side)])
    control_target.append(np.array(rig.data.bones["Hand." + side.upper()].tail_local))
    control_source.append(donor["tails"][names.index("ball_" + side)])
    control_target.append(np.array(rig.data.bones["Foot." + side.upper()].tail_local))
# Skeleton centres alone are nearly planar: constrain forward/back surface
# depth at each landmark so the warp cannot collapse the head or torso.
for source_point, target_point in list(zip(control_source, control_target)):
    for sign in (-1, 1):
        control_source.append(np.array(source_point) + np.array((0, sign * .06, 0)))
        control_target.append(np.array(target_point) + np.array((0, sign * .0684, 0)))
c = np.array(control_source); target = np.array(control_target)
radial = np.linalg.norm(c[:, None, :] - c[None, :, :], axis=2) ** 3
polynomial = np.column_stack((np.ones(len(c)), c))
system = np.block([[radial, polynomial], [polynomial.T, np.zeros((4, 4))]])
solution = np.linalg.solve(system, np.vstack((target, np.zeros((4, 3)))))
fitted = (np.linalg.norm(source[:, None, :] - c[None, :, :], axis=2) ** 3) @ solution[:len(c)]
fitted += np.column_stack((np.ones(len(source)), source)) @ solution[len(c):]
assert np.max(np.abs(system @ solution - np.vstack((target, np.zeros((4, 3)))))) < 1e-7


from mathutils import Vector
def warp(points):
 points=np.array(points);return (np.linalg.norm(points[:,None,:]-c[None,:,:],axis=2)**3)@solution[:len(c)]+np.column_stack((np.ones(len(points)),points))@solution[len(c):]
print('JOINTS',json.dumps({n:warp([donor['heads'][i],donor['tails'][i]]).tolist() for i,n in enumerate(names) if n.endswith('_r') and (n.startswith(('index','middle','ring','pinky','thumb','hand')))}))
