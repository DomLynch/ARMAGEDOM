"""Original Ashvault art. Blender CPU authoring; deterministic, no paid services.
Run: Blender -b -t 4 --python art/build_gothic.py
Coordinates: metres, Z up, front -Y. FBX supplies Unity conversion.
"""

import bpy
import math
import random
import pathlib
import numpy as np
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "Game/Assets/Resources/Gothic"
OUT.mkdir(parents=True, exist_ok=True)
random.seed(19)
M = {}


def material(name, color, metallic=0, rough=0.7):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value = (*color, 1)
    bs.inputs["Metallic"].default_value = metallic
    bs.inputs["Roughness"].default_value = rough
    M[name] = m
    return m


for name, c, metal, r in [
    ("Steel", (0.27, 0.30, 0.31), 0.8, 0.38),
    ("Edge", (0.48, 0.46, 0.39), 0.8, 0.36),
    ("Iron", (0.075, 0.083, 0.08), 0.75, 0.52),
    ("Leather", (0.12, 0.071, 0.044), 0, 0.85),
    ("Cloth", (0.105, 0.115, 0.10), 0, 0.95),
    ("Crimson", (0.19, 0.036, 0.029), 0, 0.9),
    ("Bone", (0.57, 0.49, 0.35), 0, 0.8),
    ("Skin", (0.28, 0.30, 0.19), 0, 0.8),
    ("OgreSkin", (0.39, 0.30, 0.23), 0, 0.84),
    ("Black", (0.016, 0.018, 0.014), 0, 0.9),
    ("Stone", (0.32, 0.32, 0.29), 0, 0.9),
    ("Ember", (0.75, 0.20, 0.025), 0, 0.5),
    ("Occult", (0.18, 0.38, 0.31), 0.1, 0.4),
]:
    material(name, c, metal, r)

# A reusable, seamless mottled surface; Unity tints it per material.
rng = np.random.default_rng(19)
y, x = np.mgrid[0:512, 0:512]
noise = (
    0.74 + 0.09 * np.sin(x * 0.13) * np.sin(y * 0.087) + 0.07 * rng.random((512, 512))
)
noise -= 0.15 * ((x * 7 + y * 3) % 157 < 2)
rgba = np.ones((512, 512, 4), dtype=np.float32)
rgba[:, :, :3] = noise[:, :, None]
im = bpy.data.images.new("Weathered", width=512, height=512)
im.pixels.foreach_set(rgba.ravel())
im.filepath_raw = str(OUT / "Textures/Weathered.png")
im.file_format = "PNG"
im.save()


def reset():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def finish(obj, name, mat, parent=None, smooth=True):
    obj.name = name
    if mat:
        obj.data.materials.append(M[mat])
    if obj.type == "MESH":
        for p in obj.data.polygons:
            p.use_smooth = smooth
    if parent:
        world = obj.matrix_world.copy()
        obj.parent = parent
        obj.matrix_world = world
    return obj


def empty(name, loc):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.location = loc
    bpy.context.view_layer.update()
    return o


def ell(name, loc, scale, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, location=loc)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, mat, parent)


def box(name, loc, scale, mat, bevel=0.03, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = o.modifiers.new("Worn edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = o.modifiers.new("Normals", "WEIGHTED_NORMAL")
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o, name, mat, parent, False)


def rod(name, a, b, r1, r2, mat, parent=None, verts=16):
    d = Vector(b) - Vector(a)
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts,
        radius1=r1,
        radius2=r2,
        depth=d.length,
        location=(Vector(a) + Vector(b)) / 2,
    )
    o = bpy.context.object
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return finish(o, name, mat, parent)


def mesh(name, verts, faces, mat, parent=None):
    m = bpy.data.meshes.new(name)
    m.from_pydata(verts, [], faces)
    m.update()
    o = bpy.data.objects.new(name, m)
    bpy.context.collection.objects.link(o)
    return finish(o, name, mat, parent)


def skull(loc, size, parent=None):
    x, y, z = loc
    ell("Cranium", (x, y, z), (size * 0.8, size * 0.65, size), "Bone", parent)
    ell(
        "Jaw",
        (x, y - 0.025, z - size * 0.65),
        (size * 0.6, size * 0.56, size * 0.42),
        "Bone",
        parent,
    )
    for side in [-1, 1]:
        ell(
            "Eye socket",
            (x + side * size * 0.34, y - size * 0.60, z + size * 0.12),
            (size * 0.22, size * 0.15, size * 0.24),
            "Black",
            parent,
        )
    rod(
        "Nasal cavity",
        (x, y - size * 0.68, z),
        (x, y - size * 0.7, z - size * 0.3),
        size * 0.11,
        0.003,
        "Black",
        parent,
    )
    for i in range(5):
        box(
            "Teeth",
            (x + (i - 2) * size * 0.19, y - size * 0.53, z - size * 0.62),
            (size * 0.13, size * 0.18, size * 0.25),
            "Bone",
            0.003,
            parent,
        )


def export(name):
    bpy.ops.object.select_all(action="SELECT")
    # Each UV island uses a different area of the weathered material.
    for o in list(bpy.context.selected_objects):
        if o.type == "MESH" and not o.data.uv_layers:
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(island_margin=0.01)
            bpy.ops.object.mode_set(mode="OBJECT")
    # Batch within each motion pivot/material: retain articulation without one draw per rivet.
    groups = {}
    for o in list(bpy.context.scene.objects):
        if o.type == "MESH":
            key = (o.parent, o.data.materials[0].name)
            groups.setdefault(key, []).append(o)
    for (parent, mat), objects in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for o in objects:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = (parent.name if parent else name) + "_" + mat
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.fbx(
        filepath=str(OUT / (name + ".fbx")),
        use_selection=True,
        object_types={"MESH", "EMPTY"},
        axis_forward="-Z",
        axis_up="Y",
        apply_unit_scale=True,
        bake_space_transform=False,
        add_leaf_bones=False,
        bake_anim=False,
    )
    print(
        "ASHVAULT_ART:",
        name,
        sum(
            len(o.data.polygons) for o in bpy.context.scene.objects if o.type == "MESH"
        ),
    )


def architecture():
    reset()
    # Fluted pillars, stepped bases, layered capitals at existing collision footprints.
    for x in [-7.5, 7.5]:
        for y in [-6.6, 6.6]:
            h = 3.6 if y < 0 else 2.3
            box("Plinth", (x, y, 0.14), (1.05, 1.05, 0.28), "Stone", 0.045)
            rod("Column", (x, y, 0.25), (x, y, h), 0.37, 0.29, "Stone", verts=24)
            for i in range(8):
                a = i * math.pi / 4
                dx = 0.28 * math.cos(a)
                dy = 0.28 * math.sin(a)
                rod(
                    "Clustered shaft",
                    (x + dx, y + dy, 0.3),
                    (x + dx, y + dy, h),
                    0.075,
                    0.065,
                    "Stone",
                    verts=10,
                )
            for z, w in [(h, 0.82), (h + 0.14, 0.99), (h + 0.28, 1.12)]:
                box("Capital", (x, y, z), (w, w, 0.16), "Stone", 0.025)
    # Lancet arcade along far side only, preserving combat sightlines.
    for y in [-7, -2.5, 2, 6.5]:
        for x in [10]:
            for dy in [-1.6, 1.6]:
                box("Buttress", (x, y + dy, 1.9), (0.75, 0.55, 3.8), "Stone", 0.055)
            for sign in [-1, 1]:
                for i in range(14):
                    t = i / 13
                    t2 = (i + 1) / 13
                    a = (
                        x,
                        y + sign * 1.6 * (1 - t),
                        2.65 + 2.15 * math.sin(t * math.pi / 2),
                    )
                    b = (
                        x,
                        y + sign * 1.6 * (1 - t2),
                        2.65 + 2.15 * math.sin(t2 * math.pi / 2),
                    )
                    rod("Pointed arch voussoir", a, b, 0.19, 0.19, "Stone", verts=8)
            # Tracery and narrow central mullion.
            rod("Mullion", (x, y, 1.2), (x, y, 4.65), 0.06, 0.06, "Stone")
    # North portal arch, narrow sides leave the original 6.4m gateway clear.
    for side in [-1, 1]:
        box("Portal pier", (side * 3.85, -10.3, 1.9), (0.75, 0.9, 3.8), "Stone", 0.04)
        for i in range(16):
            t = i / 16
            t2 = (i + 1) / 16
            a = (side * 3.85 * (1 - t), -10.3, 3.6 + 2.5 * math.sin(t * math.pi / 2))
            b = (side * 3.85 * (1 - t2), -10.3, 3.6 + 2.5 * math.sin(t2 * math.pi / 2))
            rod("Gate arch", a, b, 0.23, 0.23, "Stone", verts=8)
    # Rubble sits at perimeter and pillar feet, not in the navigation lane.
    for i in range(65):
        side = random.choice([-1, 1])
        x = side * random.uniform(8.7, 9.7)
        y = random.uniform(-9.5, 9.5)
        o = ell(
            "Fallen masonry",
            (x, y, 0.1),
            (
                random.uniform(0.12, 0.4),
                random.uniform(0.15, 0.5),
                random.uniform(0.08, 0.24),
            ),
            "Stone",
        )
        o.rotation_euler = (random.random(), random.random(), random.random())
    for x in [-8.9, 8.9]:
        for y in [-3, 3]:
            box("Sarcophagus", (x, y, 0.5), (0.85, 1.85, 0.75), "Stone", 0.08)
            box("Carved lid", (x, y, 0.92), (1, 2, 0.16), "Stone", 0.025)
            rod(
                "Tomb cross",
                (x, y - 0.55, 1.02),
                (x, y + 0.55, 1.02),
                0.025,
                0.025,
                "Iron",
            )
            rod(
                "Tomb crossbar",
                (x - 0.25, y - 0.15, 1.02),
                (x + 0.25, y - 0.15, 1.02),
                0.025,
                0.025,
                "Iron",
            )
    for x in [-3.6, 3.6]:
        y = -8.7
        for side in [-1, 1]:
            rod(
                "Brazier foot",
                (x + side * 0.23, y, 0.02),
                (x + side * 0.14, y, 0.61),
                0.04,
                0.035,
                "Iron",
            )
        rod("Fire bowl", (x, y, 0.57), (x, y, 0.82), 0.17, 0.33, "Iron", verts=24)
        for i in range(8):
            a = i * math.pi / 4
            rod(
                "Bowl crown",
                (x + 0.28 * math.cos(a), y + 0.28 * math.sin(a), 0.8),
                (x + 0.31 * math.cos(a), y + 0.31 * math.sin(a), 1.03),
                0.025,
                0.004,
                "Iron",
            )
        for i in range(13):
            ell(
                "Hot coal",
                (
                    x + random.uniform(-0.20, 0.20),
                    y + random.uniform(-0.20, 0.20),
                    0.84,
                ),
                (0.055, 0.045, 0.035),
                "Ember",
            )
    # Low rubble and scattered bones break up the clean tiled arena, without blocking movement.
    for i in range(22):
        x = random.uniform(-6.8, 6.8)
        y = random.uniform(-8, 8)
        if abs(x) < 2:
            continue
        if i % 4 == 0:
            skull((x, y, 0.11), 0.10)
            rod(
                "Old bone",
                (x + 0.2, y, 0.04),
                (x + 0.45, y + 0.19, 0.04),
                0.025,
                0.019,
                "Bone",
            )
        else:
            o = box(
                "Stone fragment",
                (x, y, 0.025),
                (random.uniform(0.12, 0.5), 0.2, 0.05),
                "Stone",
                0.025,
            )
            o.rotation_euler.z = random.uniform(0, 6.28)
    export("Ruins")


architecture()
