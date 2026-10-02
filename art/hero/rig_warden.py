"""CPU-only original hero rig, animation, weapon and Unity material packing.
Input is our original-reference TRELLIS mesh. No third-party character rig is used.
Blender 5.2: --background --threads 4 --python art/hero/rig_warden.py
"""

import argparse
import sys
import json
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument("--name", default="Warden")
parser.add_argument("--folder", default="Hero")
parser.add_argument("--source", type=Path, default=ROOT / "art/hero/warden-source.glb")
args = parser.parse_args(
    sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
)
NAME = args.name
OUT = ROOT / "Game/Assets/Resources" / args.folder
SOURCE = args.source.resolve()
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
body = next(o for o in bpy.data.objects if o.type == "MESH")
body.name = NAME + " armour"
lo = min(v.co.z for v in body.data.vertices)
hi = max(v.co.z for v in body.data.vertices)
for v in body.data.vertices:
    v.co = Vector(
        (
            v.co.x * 1.95 / (hi - lo),
            v.co.y * 1.95 / (hi - lo),
            (v.co.z - lo) * 1.95 / (hi - lo),
        )
    )
for p in body.data.polygons:
    p.use_smooth = True
# Preserve the reconstruction's spatially-varying base colour and PBR channels.
mat = body.data.materials[0]
mat.name = NAME


def source_image(socket):
    for link in socket.links:
        node = link.from_node
        if node.type == "TEX_IMAGE":
            return node.image
        for value in node.inputs:
            image = source_image(value)
            if image:
                return image
    return None


principled = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
albedo = source_image(principled.inputs["Base Color"])
packed = source_image(principled.inputs["Metallic"])
assert albedo and packed and source_image(principled.inputs["Roughness"]) == packed
assert len([o for o in bpy.data.objects if o.type == "MESH"]) == 1
png = bpy.data.images.new(
    NAME + "AlbedoPNG", width=albedo.size[0], height=albedo.size[1], alpha=True
)
png.colorspace_settings.name = "sRGB"
png.pixels.foreach_set(albedo.pixels[:])
png.filepath_raw = str(OUT / (NAME + "Albedo.png"))
png.file_format = "PNG"
png.save()
pixels = np.asarray(packed.pixels[:], dtype=np.float32).reshape(-1, 4)
output = np.ones_like(pixels)
output[:, :3] = pixels[:, 2, None]
output[:, 3] = 1 - pixels[:, 1]
metal = bpy.data.images.new(
    "MetallicSmoothness", width=packed.size[0], height=packed.size[1], alpha=True
)
metal.colorspace_settings.name = "Non-Color"
metal.pixels.foreach_set(output.ravel())
metal.filepath_raw = str(OUT / (NAME + "MetallicSmoothness.png"))
metal.file_format = "PNG"
metal.save()
# Skeleton matches the generated A pose. Skin weights are constrained by anatomical region.
bones = {
    "Hips": ((0, 0, 0.98), (0, 0, 1.15), None),
    "Spine": ((0, 0, 1.15), (0, 0, 1.38), "Hips"),
    "Chest": ((0, 0, 1.38), (0, 0, 1.57), "Spine"),
    "Neck": ((0, 0, 1.57), (0, 0, 1.70), "Chest"),
    "Head": ((0, 0, 1.70), (0, 0, 1.94), "Neck"),
}
for side, sign in [("L", 1), ("R", -1)]:
    bones.update(
        {
            "Clavicle." + side: ((0, 0, 1.55), (0.235 * sign, 0, 1.59), "Chest"),
            "UpperArm." + side: (
                (0.235 * sign, 0, 1.59),
                (0.385 * sign, 0, 1.30),
                "Clavicle." + side,
            ),
            "Forearm." + side: (
                (0.385 * sign, 0, 1.30),
                (0.477 * sign, -0.025, 1.025),
                "UpperArm." + side,
            ),
            "Hand." + side: (
                (0.477 * sign, -0.025, 1.025),
                (0.488 * sign, -0.055, 0.915),
                "Forearm." + side,
            ),
            "Thigh." + side: (
                (0.115 * sign, 0, 0.98),
                (0.15 * sign, 0.01, 0.55),
                "Hips",
            ),
            "Shin." + side: (
                (0.15 * sign, 0.01, 0.55),
                (0.17 * sign, 0.025, 0.145),
                "Thigh." + side,
            ),
            "Foot." + side: (
                (0.17 * sign, 0.025, 0.145),
                (0.17 * sign, -0.18, 0.045),
                "Shin." + side,
            ),
        }
    )
# The revenant reference has narrower arms and a wider stance than the Warden.
if NAME == "Revenant":
    for side, sign in [("L", 1), ("R", -1)]:
        bones["UpperArm." + side] = (
            (0.235 * sign, 0, 1.59),
            (0.33 * sign, 0, 1.30),
            "Clavicle." + side,
        )
        bones["Forearm." + side] = (
            (0.33 * sign, 0, 1.30),
            (0.40 * sign, -0.025, 0.99),
            "UpperArm." + side,
        )
        bones["Hand." + side] = (
            (0.40 * sign, -0.025, 0.99),
            (0.40 * sign, -0.055, 0.86),
            "Forearm." + side,
        )
        bones["Thigh." + side] = (
            (0.16 * sign, 0, 0.98),
            (0.20 * sign, 0.01, 0.55),
            "Hips",
        )
        bones["Shin." + side] = (
            (0.20 * sign, 0.01, 0.55),
            (0.23 * sign, 0.025, 0.145),
            "Thigh." + side,
        )
        bones["Foot." + side] = (
            (0.23 * sign, 0.025, 0.145),
            (0.23 * sign, -0.18, 0.045),
            "Shin." + side,
        )
arm = bpy.data.armatures.new(NAME + " original skeleton")
rig = bpy.data.objects.new(NAME + "Rig", arm)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
for name, (head, tail, parent) in bones.items():
    bone = arm.edit_bones.new(name)
    bone.head = head
    bone.tail = tail
    if parent:
        bone.parent = arm.edit_bones[parent]
bpy.ops.object.mode_set(mode="OBJECT")


def bind(obj, rigid=None):
    obj.parent = rig
    mod = obj.modifiers.new("Skeleton", "ARMATURE")
    mod.object = rig
    if rigid:
        group = obj.vertex_groups.new(name=rigid)
        group.add(list(range(len(obj.data.vertices))), 1, "REPLACE")
        return
    groups = {n: obj.vertex_groups.new(name=n) for n in bones}

    def distance(p, n):
        a, b, _ = bones[n]
        a = Vector(a)
        b = Vector(b)
        d = b - a
        return (p - (a + d * max(0, min(1, (p - a).dot(d) / d.length_squared)))).length

    for v in obj.data.vertices:
        x, y, z = v.co
        side = "L" if x > 0 else "R"
        ax = abs(x)
        if z > 1.70:
            candidates = ["Head"]
        elif z > 1.57 and ax < 0.15:
            candidates = ["Neck", "Head"]
        elif z > 1.40 and ax > 0.11:
            candidates = ["Chest", "Clavicle." + side, "UpperArm." + side]
        elif ax > 0.28 and z > 0.90:
            candidates = ["UpperArm." + side, "Forearm." + side, "Hand." + side]
        elif z < 0.96 and not (ax < 0.075 and z > 0.58):
            candidates = ["Thigh." + side, "Shin." + side, "Foot." + side]
        else:
            candidates = ["Hips", "Spine", "Chest"]
        if NAME == "Revenant":
            # Continuous nearest-bone blend avoids classifying low fingers as legs
            # or the inner elbow as torso along a hard x/z boundary.
            candidates = list(
                bones
            )  # Include both legs across the centre of joined cloth.
        ranked = sorted((distance(v.co, n), n) for n in candidates)[
            : 4 if NAME == "Revenant" else 2
        ]
        weights = [1 / max(d, 0.025) ** 4 for d, n in ranked]
        total = sum(weights)
        for (_, name), weight in zip(ranked, weights):
            groups[name].add([v.index], weight / total, "REPLACE")


bind(body)
# Original weapon: double-edged ridged blade, swept guard, leather grip and brass pommel.
# Geometry is authored in the right fist's rest coordinates and rigidly attached to Hand.R.
weapon_mat = bpy.data.materials.new(NAME + "Steel")
weapon_mat.diffuse_color = (0.42, 0.45, 0.49, 1)
weapon_mat.use_nodes = True
bs = weapon_mat.node_tree.nodes.get("Principled BSDF")
bs.inputs["Metallic"].default_value = 0.92
bs.inputs["Roughness"].default_value = 0.3
objects = []


def mesh(name, verts, faces):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(weapon_mat)
    objects.append(obj)
    return obj


cx, cy, cz = (-0.40, -0.06, 0.94) if NAME == "Revenant" else (-0.49, -0.06, 0.96)
# Blade extends down and slightly forward, separate from the character's leg.
verts = []
for t, w in [(0, 0.041), (0.12, 0.04), (0.70, 0.027), (0.84, 0)]:
    if NAME == "Revenant":
        w *= 1.8
    for dx, dy in [(-w, 0), (0, -0.008), (w, 0), (0, 0.008)]:
        verts.append((cx + dx, cy + dy - 0.65 * t, cz - 0.16 - 0.68 * t))
faces = []
for i in range(3):
    for j in range(4):
        faces.append(
            (i * 4 + j, i * 4 + (j + 1) % 4, (i + 1) * 4 + (j + 1) % 4, (i + 1) * 4 + j)
        )
faces.extend([(3, 2, 1, 0), (12, 13, 14, 15)])
mesh("Ashblade", verts, faces)


def cylinder(name, position, radius, depth, vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=position
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(weapon_mat)
    objects.append(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bevel = obj.modifiers.new("Forged edge", "BEVEL")
    bevel.width = 0.003
    bevel.segments = 2
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


cylinder("Sword grip", (cx, cy, cz - 0.04), 0.017, 0.20)
for i in range(9):
    cylinder("Grip binding", (cx, cy, cz - 0.115 + i * 0.018), 0.019, 0.005)
cylinder("Pommel", (cx, cy, cz + 0.085), 0.028, 0.035)
# Curved wing guard, closed beveled mesh.
profile = [
    (-0.14, 0.01),
    (-0.13, -0.015),
    (-0.065, -0.005),
    (0, 0.015),
    (0.065, -0.005),
    (0.13, -0.015),
    (0.14, 0.01),
    (0.07, 0.025),
    (0, 0.04),
    (-0.07, 0.025),
]
v = [(cx + x, cy + y, cz - 0.16 + z) for y in [-0.013, 0.013] for x, z in profile]
n = len(profile)
f = [tuple(range(n - 1, -1, -1)), tuple(range(n, n * 2))] + [
    (i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)
]
mesh("Swept crossguard", v, f)
# Join only weapon pieces; one additional draw, preserved separate metal material.
bpy.ops.object.select_all(action="DESELECT")
for o in objects:
    o.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
bpy.ops.object.join()
weapon = bpy.context.object
bind(weapon, "Hand.R")
# Entire animation is authored here. Cosmetic only: gameplay retains damage timing.
scene = bpy.context.scene
scene.render.fps = 30
for pb in rig.pose.bones:
    pb.rotation_mode = "QUATERNION"


def pose(name, x=0, y=0, z=0):
    pb = rig.pose.bones[name]
    rest = pb.bone.matrix_local.to_quaternion()
    q = Quaternion((1, 0, 0), x) @ Quaternion((0, 1, 0), y) @ Quaternion((0, 0, 1), z)
    pb.rotation_quaternion = rest.inverted() @ q @ rest


for frame in range(1, 105):
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
    idle = math.sin((frame - 1) * math.tau / 59)
    pose("UpperArm.R", -0.08, -0.21)
    pose("UpperArm.L", -0.12, 0.21)
    pose("Forearm.R", -0.28)
    pose("Forearm.L", -0.35)
    pose("Chest", 0.012 * idle)
    pose("Head", 0, 0, 0.018 * idle)
    if 61 <= frame <= 85:
        phase = (frame - 61) * math.tau / 24
        rig.pose.bones["Hips"].location.z = 0.018 * (1 - math.cos(phase * 2))
        pose("Chest", 0.05, 0, 0.035 * math.sin(phase))
        for side, offset in [("L", 0), ("R", math.pi)]:
            wave = math.sin(phase + offset)
            pose("Thigh." + side, 0.5 * wave)
            pose("Shin." + side, -0.65 * max(0, -wave))
            pose("Foot." + side, 0.18 * max(0, -wave))
            pose("UpperArm." + side, -0.3 * wave, 0.21 if side == "L" else -0.21)
    elif frame >= 86:
        t = (frame - 86) / 18
        swing = math.sin(t * math.pi)
        pose("Chest", 0, 0, -0.28 * math.sin(t * math.tau))
        pose("UpperArm.R", -1.1 * swing, -0.21, 0.65 * math.sin(t * math.tau))
        pose("Forearm.R", -0.28 - 0.65 * swing)
        pose("Thigh.L", -0.10 * swing)
        pose("Shin.L", -0.12 * swing)
    for pb in rig.pose.bones:
        pb.keyframe_insert(data_path="rotation_quaternion", frame=frame)
        if pb.name == "Hips":
            pb.keyframe_insert(data_path="location", frame=frame)
scene.frame_start = 1
scene.frame_end = 104
scene.frame_set(1)
# Tangent-space micro normal from original material luminance high frequencies only.
# Low amplitude prevents painted light/shadow from being interpreted as macro relief.
rgb = np.asarray(albedo.pixels[:], dtype=np.float32).reshape(
    albedo.size[1], albedo.size[0], 4
)
lum = rgb[:, :, :3].mean(axis=2)
gx = np.roll(lum, -1, axis=1) - np.roll(lum, 1, axis=1)
gy = np.roll(lum, -1, axis=0) - np.roll(lum, 1, axis=0)
normal = np.ones_like(rgb)
normal[:, :, 0] = 0.5 - gx * 0.16
normal[:, :, 1] = 0.5 - gy * 0.16
normal[:, :, 2] = 1
img = bpy.data.images.new(
    "MicroNormal", width=albedo.size[0], height=albedo.size[1], alpha=True
)
img.colorspace_settings.name = "Non-Color"
img.pixels.foreach_set(normal.ravel())
img.filepath_raw = str(OUT / (NAME + "Normal.png"))
img.file_format = "PNG"
img.save()
bpy.ops.wm.save_as_mainfile(
    filepath=str(SOURCE.parent / (NAME.lower() + "-rigged.blend"))
)
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
(SOURCE.parent / "rig-report.json").write_text(
    json.dumps(
        {
            "vertices": len(body.data.vertices),
            "triangles": len(body.data.polygons),
            "bones": len(bones),
            "height": 1.95,
            "texture_size": list(albedo.size),
            "frames": 104,
            "original_rig": True,
        },
        indent=2,
    )
    + "\n"
)
print(
    "WARDEN_EXPORT_PASS",
    len(body.data.vertices),
    "vertices",
    len(bones),
    "bones",
    flush=True,
)
