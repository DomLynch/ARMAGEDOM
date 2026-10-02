"""Refine existing original rigs on CPU without reconstructing or retexturing.
Blender --background --threads 4 --python art/hero/refine_motion.py -- Warden
The run cycle covers 2.375m; runtime playback matches actual travelled distance.
"""

import sys
import math
import json
from pathlib import Path
import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
NAME = sys.argv[sys.argv.index("--") + 1]
SOURCE = ROOT / (
    "art/hero/warden-rigged.blend"
    if NAME == "Warden"
    else "art/enemies/revenant-rigged.blend"
    if NAME == "Revenant"
    else f"art/enemies/{NAME.lower()}/{NAME.lower()}-rigged.blend"
)
OUT = ROOT / "Game/Assets/Resources" / ("Hero" if NAME == "Warden" else "Enemies")
bpy.ops.wm.open_mainfile(filepath=str(SOURCE), use_scripts=False)
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
rig.animation_data_clear()
scene = bpy.context.scene
scene.render.fps = 30
for pb in rig.pose.bones:
    pb.rotation_mode = "QUATERNION"
rest = {b.name: b.matrix_local.copy() for b in rig.data.bones}


def pose(name, x=0, y=0, z=0):
    q = Quaternion((1, 0, 0), x) @ Quaternion((0, 1, 0), y) @ Quaternion((0, 0, 1), z)
    r = rest[name].to_quaternion()
    rig.pose.bones[name].rotation_quaternion = r.inverted() @ q @ r


def aim_bone(name, head, tail):
    bone = rig.data.bones[name]
    q = (bone.tail_local - bone.head_local).rotation_difference(tail - head)
    rig.pose.bones[name].matrix = (
        Matrix.Translation(head)
        @ q.to_matrix().to_4x4()
        @ rest[name].to_quaternion().to_matrix().to_4x4()
    )
    bpy.context.view_layer.update()


def leg(side, ankle):
    thigh, shin, foot = ["%s.%s" % (n, side) for n in ["Thigh", "Shin", "Foot"]]
    hip = rig.pose.bones[thigh].head.copy()
    a, b = rig.data.bones[thigh].length, rig.data.bones[shin].length
    delta = ankle - hip
    distance = min(delta.length, a + b - 0.001)
    axis = delta.normalized()
    pole = Vector((0, -1, 0))
    pole = (pole - axis * pole.dot(axis)).normalized()
    along = (a * a - b * b + distance * distance) / (2 * distance)
    knee = hip + axis * along + pole * math.sqrt(max(0, a * a - along * along))
    ankle = hip + axis * distance
    aim_bone(thigh, hip, knee)
    aim_bone(shin, knee, ankle)
    # Keep the ankle/sole at its original orientation, instead of toe-diving.
    rig.pose.bones[foot].matrix = (
        Matrix.Translation(ankle) @ rest[foot].to_quaternion().to_matrix().to_4x4()
    )
    bpy.context.view_layer.update()


def smooth(t):
    return t * t * (3 - 2 * t)


def curve(t, keys):
    for (a, va), (b, vb) in zip(keys, keys[1:]):
        if t <= b:
            u = smooth(max(0, (t - a) / (b - a)))
            return va + (vb - va) * u
    return keys[-1][1]


contacts = []
for frame in range(1, 105):
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    t = (frame - 1) / 59
    pose("UpperArm.R", -0.10, -0.17)
    pose("UpperArm.L", -0.08, 0.17)
    pose("Forearm.R", -0.32)
    pose("Forearm.L", -0.25)
    pose("Chest", 0.012 * math.sin(t * math.tau))
    pose("Head", 0, 0, 0.008 * math.sin(t * math.tau))
    hip_offset = Vector((0, 0, -0.055))
    feet = {s: rig.data.bones["Foot." + s].head_local.copy() for s in ["L", "R"]}
    if 61 <= frame <= 85:
        phase = (frame - 61) / 24
        hip_offset.z = -0.155 + 0.008 * math.cos(phase * math.tau * 2)
        hip_offset.x = 0.012 * math.sin(phase * math.tau)
        pose("Chest", 0.075, 0, 0.035 * math.sin(phase * math.tau))
        pose("Head", -0.035, 0, -0.02 * math.sin(phase * math.tau))
        for side, offset in [("L", 0), ("R", 0.5)]:
            p = (phase + offset) % 1
            if p < 0.4:
                # Stance: backward at constant speed, cancelling root travel.
                feet[side].y += -0.475 + 0.95 * p / 0.4
            else:
                swing = (p - 0.4) / 0.6
                feet[side].y += 0.475 - 0.95 * smooth(swing)
                feet[side].z += 0.21 * math.sin(math.pi * swing) ** 2
            wave = math.sin((phase + offset) * math.tau)
            pose(
                "UpperArm." + side, -0.12 - 0.18 * wave, 0.17 if side == "L" else -0.17
            )
            pose("Forearm." + side, -0.43 + 0.08 * wave)
    elif frame >= 86:
        t = (frame - 86) / 18
        # 0.45 is the contact frame used by ArtMotion, independent of wind-up duration.
        lift = curve(t, [(0, 0), (0.28, 1), (0.45, 0.65), (0.65, 0.15), (1, 0)])
        sweep = curve(t, [(0, 0), (0.28, -0.32), (0.45, 0.40), (0.65, 0.52), (1, 0)])
        pose("Chest", 0.06 * lift, 0, -0.38 * sweep)
        pose("Head", -0.025 * lift, 0, 0.12 * sweep)
        pose("UpperArm.R", -0.10 - 0.72 * lift, -0.17, sweep)
        pose("Forearm.R", -0.32 - 0.45 * lift)
        pose("UpperArm.L", -0.08 - 0.16 * lift, 0.17, -0.12 * sweep)
        pose("Forearm.L", -0.25 - 0.2 * lift)
        hip_offset.y = -0.055 * lift
        hip_offset.z -= 0.025 * lift
        if NAME == "Warlock":
            pose("UpperArm.R", -0.10 - 0.12 * lift, -0.17)
            pose("Forearm.R", -0.20)
            pose("UpperArm.L", -0.08 - 0.70 * lift, 0.17)
            pose("Forearm.L", -0.25 - 0.20 * lift)
    rig.pose.bones["Hips"].location = (
        rest["Hips"].to_quaternion().inverted() @ hip_offset
    )
    bpy.context.view_layer.update()
    for side in ["L", "R"]:
        leg(side, feet[side])
    for pb in rig.pose.bones:
        pb.keyframe_insert(data_path="rotation_quaternion", frame=frame)
        pb.keyframe_insert(data_path="location", frame=frame)
    if 61 <= frame <= 85:
        contacts.append(
            {
                "frame": frame,
                **{s: list(rig.pose.bones["Foot." + s].head) for s in ["L", "R"]},
            }
        )
scene.frame_set(1)
scene.frame_start, scene.frame_end = 1, 104
# Linear interpolation preserves the constant stance speed between baked samples.
for layer in rig.animation_data.action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for fc in bag.fcurves:
                for key in fc.keyframe_points:
                    key.interpolation = "LINEAR"
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.fbx(
    filepath=str(OUT / (NAME + ".fbx")),
    use_selection=True,
    object_types={"MESH", "ARMATURE"},
    axis_forward="-Z",
    axis_up="Y",
    apply_scale_options="FBX_SCALE_ALL",
    global_scale=1,
    add_leaf_bones=False,
    bake_space_transform=False,
    bake_anim=True,
    bake_anim_use_all_actions=False,
    bake_anim_use_nla_strips=False,
    bake_anim_simplify_factor=0,
    path_mode="STRIP",
)
(ROOT / "artifacts" / (NAME.lower() + "-foot-contact.json")).write_text(
    json.dumps(contacts, indent=2) + "\n"
)
print("MOTION_EXPORT_PASS", NAME, flush=True)
