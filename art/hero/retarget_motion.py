"""Retarget pinned CC0 motion onto an original rig; write a separate candidate.
Blender -b -t 4 --python art/hero/retarget_motion.py -- Sprint Revenant
"""

import sys
import json
import math
from pathlib import Path
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
clip = args[0] if args else "Sprint"
name = args[1] if len(args) > 1 else "Warden"
assert name in ("Warden", "Revenant", "Orc", "Warlock")
out = (
    ROOT
    / "artifacts"
    / ("motion-" + clip.lower() + ("" if name == "Warden" else "-" + name.lower()))
)
out.mkdir(exist_ok=True)
source_path = (
    "art/hero/warden-rigged.blend"
    if name == "Warden"
    else "art/enemies/revenant-rigged.blend"
    if name == "Revenant"
    else f"art/enemies/{name.lower()}/{name.lower()}-rigged.blend"
)
bpy.ops.wm.open_mainfile(filepath=str(ROOT / source_path), use_scripts=False)
hero = next(o for o in bpy.data.objects if o.type == "ARMATURE")
objects = set(bpy.data.objects)
action = hero.animation_data.action
bpy.ops.import_scene.gltf(
    filepath=str(ROOT / "art/reference-motion/mesh2motion-human-base.glb")
)
source = next(o for o in bpy.data.objects if o.type == "ARMATURE" and o not in objects)
for track in list(source.animation_data.nla_tracks):
    source.animation_data.nla_tracks.remove(track)
source.animation_data.action = bpy.data.actions[clip]
source.animation_data.action_slot = source.animation_data.action.slots[0]
lo, hi = source.animation_data.action.frame_range
scene = bpy.context.scene
scene.render.fps = 30
mapping = {
    "Hips": "pelvis",
    "Spine": "spine_01",
    "Chest": "spine_03",
    "Neck": "neck_01",
    "Head": "head",
}
for side in "LR":
    for a, b in [
        ("Clavicle", "clavicle"),
        ("UpperArm", "upperarm"),
        ("Forearm", "lowerarm"),
        ("Hand", "hand"),
        ("Thigh", "thigh"),
        ("Shin", "calf"),
        ("Foot", "foot"),
    ]:
        mapping[a + "." + side] = b + "_" + side.lower()
assert all(n in source.pose.bones for n in mapping.values()), list(
    source.pose.bones.keys()
)
rest = {b.name: b.matrix_local.copy() for b in hero.data.bones}
# The staff arm keeps the original carry pose while hips and shoulders still move.
bpy.context.scene.frame_set(1)
carry = {
    b.name: b.matrix_basis.copy()
    for b in hero.pose.bones
    if b.name.endswith(".R")
    and b.name.startswith(("Clavicle", "UpperArm", "Forearm", "Hand"))
}
if name == "Warlock":
    # Whole-staff clearance checked between keys; keep elbow, wrist and grip intact.
    carry["UpperArm.R"] = carry["UpperArm.R"] @ Matrix.Rotation(
        math.radians(21), 4, "X"
    )
ratio = (hero.data.bones["Thigh.L"].length + hero.data.bones["Shin.L"].length) / (
    source.data.bones["thigh_l"].length + source.data.bones["calf_l"].length
)


def place_foot(side, ankle):
    thigh, shin, foot = [
        hero.pose.bones[n + "." + side] for n in ("Thigh", "Shin", "Foot")
    ]
    hip = thigh.head.copy()
    a, b = thigh.bone.length, shin.bone.length
    delta = ankle - hip
    distance = min(delta.length, a + b - 0.001)
    axis = delta.normalized()
    pole = Vector((0, -1, 0))
    pole = (pole - axis * pole.dot(axis)).normalized()
    along = (a * a - b * b + distance * distance) / (2 * distance)
    knee = hip + axis * along + pole * math.sqrt(max(0, a * a - along * along))
    ankle = hip + axis * distance
    foot_rotation = foot.matrix.to_quaternion()
    for bone, head, tail in ((thigh, hip, knee), (shin, knee, ankle)):
        direction = bone.bone.tail_local - bone.bone.head_local
        q = direction.rotation_difference(tail - head) @ rest[bone.name].to_quaternion()
        bone.matrix = Matrix.Translation(head) @ q.to_matrix().to_4x4()
        bpy.context.view_layer.update()
    foot.matrix = Matrix.Translation(ankle) @ foot_rotation.to_matrix().to_4x4()
    bpy.context.view_layer.update()


# Cache source before changing the scene timeline used by the target's action.
poses = []
for i in range(97):
    frame = lo + (hi - lo) * i / 96
    scene.frame_set(int(frame), subframe=frame % 1)
    bpy.context.view_layer.update()
    poses.append({n: source.pose.bones[n].matrix.copy() for n in mapping.values()})
hero.animation_data.action = action
rows = []
for i, source_pose in enumerate(poses):
    frame = 61 + i / 4
    scene.frame_set(int(frame), subframe=frame % 1)
    for bone in hero.pose.bones:
        bone.rotation_mode = "QUATERNION"
    for bone_name, src_name in mapping.items():
        bone = hero.pose.bones[bone_name]
        src_rest = source.data.bones[src_name].matrix_local
        delta = (
            source_pose[src_name].to_quaternion() @ src_rest.to_quaternion().inverted()
        )
        # Preserve our ankle's bind-pose sole angle; match anatomical limb directions.
        align = (rest[bone_name].to_3x3() @ Vector((0, 1, 0))).rotation_difference(
            src_rest.to_3x3() @ Vector((0, 1, 0))
        )
        if bone_name.startswith(("Foot", "Clavicle")):
            align.identity()
        rotation = delta @ align @ rest[bone_name].to_quaternion()
        head = bone.head.copy()
        if bone_name == "Hips":
            head = (
                rest[bone_name].translation
                + (source_pose[src_name].translation - src_rest.translation) * ratio
            )
            # Leave knee extension for world-space planting above the capsule's skin offset.
            if clip == "Walk":
                head.z -= 0.035
        bone.matrix = Matrix.Translation(head) @ rotation.to_matrix().to_4x4()
        if name == "Warlock" and bone_name in carry:
            bone.matrix_basis = carry[bone_name]
        bpy.context.view_layer.update()
    for side in "LR":
        src_name = "foot_" + side.lower()
        ankle = (
            rest["Foot." + side].translation
            + (
                source_pose[src_name].translation
                - source.data.bones[src_name].head_local
            )
            * ratio
        )
        place_foot(side, ankle)
    # Ground against the actual weighted boot soles, not just the ankle joint.
    for _ in range(2):
        for side in "LR":
            minimum = 1.0
            for mesh in objects:
                if mesh.type != "MESH" or "Foot." + side not in mesh.vertex_groups:
                    continue
                group = mesh.vertex_groups["Foot." + side].index
                indices = [
                    v.index
                    for v in mesh.data.vertices
                    if any(g.group == group and g.weight > 0.6 for g in v.groups)
                ]
                if not indices:
                    continue
                evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
                data = evaluated.to_mesh()
                minimum = min(
                    minimum,
                    min(
                        (evaluated.matrix_world @ data.vertices[n].co).z
                        for n in indices
                    ),
                )
                evaluated.to_mesh_clear()
            if minimum < 0:
                ankle = hero.pose.bones["Foot." + side].head.copy()
                ankle.z -= minimum
                place_foot(side, ankle)
    for bone in hero.pose.bones:
        bone.keyframe_insert(data_path="rotation_quaternion", frame=frame)
        bone.keyframe_insert(data_path="location", frame=frame)
    rows.append(
        {"phase": i / 96, **{s: list(hero.pose.bones["Foot." + s].head) for s in "LR"}}
    )

for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for fc in bag.fcurves:
                for key in fc.keyframe_points:
                    key.interpolation = "LINEAR"
for obj in list(bpy.data.objects):
    if obj not in objects:
        bpy.data.objects.remove(obj, do_unlink=True)
scene.frame_start, scene.frame_end = 1, 104
scene.frame_set(1)
bpy.ops.object.select_all(action="DESELECT")
for obj in objects:
    obj.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(out / (name.lower() + ".blend")))
bpy.ops.export_scene.fbx(
    filepath=str(out / (name + ".fbx")),
    use_selection=True,
    object_types={"MESH", "ARMATURE"},
    axis_forward="-Z",
    axis_up="Y",
    apply_scale_options="FBX_SCALE_ALL",
    global_scale=1,
    add_leaf_bones=False,
    bake_space_transform=False,
    bake_anim=True,
    bake_anim_step=0.25,
    bake_anim_use_all_actions=False,
    bake_anim_use_nla_strips=False,
    bake_anim_simplify_factor=0,
    path_mode="STRIP",
)
(out / "contacts.json").write_text(
    json.dumps({"clip": clip, "leg_scale": ratio, "samples": rows}, indent=2) + "\n"
)
print("RETARGET_PILOT", clip, out)
