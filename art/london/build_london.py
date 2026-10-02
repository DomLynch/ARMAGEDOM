"""Original modular London checkpoint kit. Blender 5.2, local CPU, metre scale.

Run from the repo: Blender -b --factory-startup -t 4 --python art/london/build_london.py
Each FBX is a reusable prop; placement and collision belong to the Unity prefab.
"""

import hashlib
import json
import math
import pathlib
import random

import bpy
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "Game/Assets/Art/London/Models"
OUT.mkdir(parents=True, exist_ok=True)
random.seed(2030)
for name in ("Cube", "Camera", "Light"):
    if name in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
MATS = {}
SPEC = {
    "Asphalt": ((0.65, 0.63, 0.60), 0, 0.08, "Asphalt"),
    "Brick": ((0.65, 0.57, 0.46), 0, 0.1, "Brick"),
    "Stone": ((0.55, 0.52, 0.44), 0, 0.12, "Stone"),
    "RedPaint": ((0.39, 0.048, 0.024), 0.45, 0.2, "Weathered"),
    "Iron": ((0.095, 0.105, 0.10), 0.65, 0.24, "Weathered"),
    "Rust": ((0.24, 0.10, 0.041), 0.3, 0.08, "Weathered"),
    "Canvas": ((0.33, 0.28, 0.18), 0, 0.05, "Weathered"),
    "Glass": ((0.018, 0.028, 0.029), 0.35, 0.65, None),
    "RoadPaint": ((0.65, 0.61, 0.48), 0, 0.08, "Weathered"),
    "Rubber": ((0.028, 0.025, 0.022), 0, 0.04, "Weathered"),
    "LampGlass": ((1, 0.52, 0.16), 0, 0.25, None),
    "Water": ((0.055, 0.070, 0.072), 0.5, 0.92, None),
}
for name, (color, metal, smooth, texture) in SPEC.items():
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Roughness"].default_value = 1 - smooth
    MATS[name] = material

objects = []
reports = []


def finish(obj, name, material):
    obj.name = name
    obj.data.materials.append(MATS[material])
    objects.append(obj)
    return obj


def box(name, pos, size, material, bevel=0.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Worn edges", "BEVEL")
        modifier.width = min(bevel, min(size) / 3)
        modifier.segments = 2
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        modifier = obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return finish(obj, name, material)


def rod(name, a, b, radius, material, radius2=None, vertices=12):
    delta = Vector(b) - Vector(a)
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius,
        radius2=radius if radius2 is None else radius2,
        depth=delta.length,
        location=(Vector(a) + Vector(b)) / 2,
    )
    obj = bpy.context.object
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    return finish(obj, name, material)


def stone(name, pos, scale, material="Stone", subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=subdivisions, radius=1, location=pos
    )
    obj = bpy.context.object
    for vertex in obj.data.vertices:
        vertex.co *= random.uniform(0.78, 1.15)
    obj.scale = scale
    obj.rotation_euler = [random.uniform(-0.3, 0.3) for _ in range(3)]
    return finish(obj, name, material)


def export(name):
    bpy.ops.object.select_all(action="DESELECT")
    # World-sized planar UVs avoid stretched texture detail on long road/wall faces.
    for obj in objects:
        uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name="UVMap")
        for poly in obj.data.polygons:
            normal = obj.matrix_world.to_3x3() @ poly.normal
            dominant = max(range(3), key=lambda i: abs(normal[i]))
            axes = [(1, 2), (0, 2), (0, 1)][dominant]
            for loop in poly.loop_indices:
                point = (
                    obj.matrix_world
                    @ obj.data.vertices[obj.data.loops[loop].vertex_index].co
                )
                uv.data[loop].uv = (point[axes[0]] / 2, point[axes[1]] / 2)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.calc_loop_triangles()
    assert all(math.isfinite(v) for vertex in obj.data.vertices for v in vertex.co)
    target = OUT / (name + ".fbx")
    bpy.ops.export_scene.fbx(
        filepath=str(target),
        use_selection=True,
        object_types={"MESH"},
        axis_forward="-Z",
        axis_up="Y",
        apply_scale_options="FBX_SCALE_ALL",
        bake_anim=False,
        add_leaf_bones=False,
        path_mode="STRIP",
    )
    reports.append(
        {
            "asset": name,
            "triangles": len(obj.data.loop_triangles),
            "vertices": len(obj.data.vertices),
            "bytes": target.stat().st_size,
            "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
        }
    )
    # Keep an inspectable kit arranged on a grid in the original authoring blend.
    obj.location = (len(reports) % 4 * 28, len(reports) // 4 * 28, 0)
    objects.clear()


# Road and pavements: current21m arena, level central lane, chipped perimeter curbs.
box("Road bed", (0, 0, -0.13), (21, 21, 0.26), "Asphalt", 0)
for side in (-1, 1):
    box("Stone pavement", (side * 8.6, 0, 0.035), (3.7, 21, 0.07), "Stone", 0.01)
    for i in range(25):
        box(
            "Kerbstone",
            (side * 6.85, -10 + i * 0.83, 0.045),
            (0.2, 0.8, 0.09),
            "Stone",
            0.03,
        )
    for i in range(10):
        box(
            "Faded yellow line",
            (side * 6.45, -9.6 + i * 2, 0.003),
            (0.06, 1.7, 0.005),
            "RoadPaint",
            0,
        )
for y in range(-9, 10, 3):
    box("Broken centre marking", (0, y, 0.004), (0.10, 1.2, 0.007), "RoadPaint", 0)
for i in range(60):
    x, y = random.uniform(-6.6, 6.6), random.uniform(-10, 10)
    length = random.uniform(0.15, 1.1)
    obj = box("Tar fracture", (x, y, 0.006), (0.018, length, 0.006), "Rubber", 0)
    obj.rotation_euler.z = random.uniform(-1.3, 1.3)
export("Road")

# Hollow damaged double deck bus with two rows of empty/broken window apertures.
box("Burnt chassis", (0, 0, 0.45), (2.4, 7.4, 0.34), "Iron", 0.09)
for side in (-1, 1):
    for level in (1.02, 2.35, 3.68):
        box(
            "Red belt panel",
            (side * 1.2, 0, level),
            (0.10, 7.4, 0.42),
            "RedPaint",
            0.025,
        )
    for y in (-3.6, -2.4, -1.2, 0, 1.2, 2.4, 3.6):
        box(
            "Window frame", (side * 1.2, y, 2.33), (0.09, 0.09, 2.65), "RedPaint", 0.014
        )
    for y in (-2.35, 2.35):
        rod(
            "Burnt tyre",
            (side * 1.04, y, 0.52),
            (side * 1.32, y, 0.52),
            0.47,
            "Rubber",
            vertices=24,
        )
        rod(
            "Wheel hub",
            (side * 1.30, y, 0.52),
            (side * 1.35, y, 0.52),
            0.26,
            "Rust",
            vertices=16,
        )
    for i in range(24):
        y = random.uniform(-3.6, 3.6)
        z = random.choice((1.02, 2.35, 3.68)) + random.uniform(-0.17, 0.16)
        box(
            "Exposed corroded panel",
            (side * 1.258, y, z),
            (0.008, random.uniform(0.1, 0.7), random.uniform(0.02, 0.1)),
            "Rust",
            0,
        )
for level in (0.75, 2.15):
    box("Charred passenger floor", (0, 0, level), (2.3, 7.3, 0.1), "Iron", 0.01)
    for y in (-2.5, -1.2, 0.1, 1.4, 2.7):
        for x in (-0.73, 0.73):
            box("Burned seat", (x, y, level + 0.28), (0.45, 0.48, 0.12), "Rust", 0.035)
            box(
                "Seat frame",
                (x, y + 0.2, level + 0.57),
                (0.46, 0.08, 0.5),
                "Iron",
                0.025,
            )
for y in (-3.69, 3.69):
    box("End lower panel", (0, y, 1.0), (2.4, 0.10, 0.7), "RedPaint", 0.025)
    box("End belt", (0, y, 2.35), (2.4, 0.10, 0.3), "RedPaint", 0.02)
    box("Route sign frame", (0, y, 3.7), (2.4, 0.12, 0.36), "RedPaint", 0.025)
    box(
        "Dead destination sign", (0, y * 1.02, 3.69), (1.55, 0.018, 0.18), "Glass", 0.01
    )
    box("Window divider", (0, y, 2.45), (0.075, 0.10, 2.2), "Iron", 0.01)
    box("Bumper", (0, y * 1.03, 0.63), (2.52, 0.18, 0.15), "Iron", 0.02)
for y in (-3.4, -2.7, -2, -0.8, 0.2, 2.8, 3.4):
    obj = box(
        "Twisted roof remnant", (0, y, 3.97), (2.45, 0.63, 0.10), "RedPaint", 0.025
    )
    obj.rotation_euler.y = random.uniform(-0.10, 0.12)
for x in (-1.1, 1.1):
    rod("Collapsed upper frame", (x, -0.1, 3.92), (x * 0.65, 2.9, 3.45), 0.055, "Rust")
export("BusWreck")

# Repeatable concrete checkpoint barrier, scuffed white/red faces and lifting loops.
cross = [
    (-0.45, 0),
    (0.45, 0),
    (0.45, 0.15),
    (0.18, 0.62),
    (0.16, 0.95),
    (-0.16, 0.95),
    (-0.18, 0.62),
    (-0.45, 0.15),
]
verts = [(x, y, z) for x in (-1.35, 1.35) for y, z in cross]
faces = [tuple(reversed(range(8))), tuple(range(8, 16))]
faces += [(i, (i + 1) % 8, (i + 1) % 8 + 8, i + 8) for i in range(8)]
mesh = bpy.data.meshes.new("Jersey profile")
mesh.from_pydata(verts, [], faces)
mesh.update()
obj = bpy.data.objects.new("Barrier", mesh)
bpy.context.collection.objects.link(obj)
finish(obj, "Concrete", "Stone")
for x in (-0.95, -0.35, 0.25, 0.85):
    for side in (-1, 1):
        box(
            "Faded red marker",
            (x, side * 0.172, 0.80),
            (0.28, 0.012, 0.23),
            "RedPaint",
            0.004,
        )
for x in (-0.75, 0.75):
    rod("Lifting staple", (x, -0.08, 0.93), (x, -0.08, 1.03), 0.022, "Iron")
    rod("Lifting staple", (x, -0.08, 1.03), (x, 0.08, 1.03), 0.022, "Iron")
export("Barrier")

# Sandbags are individual rounded sacks with compressed seams, batched into one prop.
for row in range(3):
    for col in range(5 - (row == 2)):
        x = (col - 2) * 0.53 + (row % 2) * 0.24
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=12,
            ring_count=6,
            radius=1,
            location=(x, random.uniform(-0.035, 0.035), 0.14 + row * 0.23),
        )
        obj = bpy.context.object
        obj.scale = (0.31, 0.25, 0.15)
        obj.rotation_euler.z = random.uniform(-0.12, 0.12)
        finish(obj, "Compressed hessian sack", "Canvas")
        rod(
            "Stitched end",
            (x + 0.27, -0.12, 0.14 + row * 0.23),
            (x + 0.27, 0.12, 0.14 + row * 0.23),
            0.011,
            "Iron",
            vertices=6,
        )
export("Sandbags")

# Victorian riverfront light, with a separate warm glass insert.
box("Lamp plinth", (0, 0, 0.11), (0.43, 0.43, 0.22), "Stone", 0.045)
rod("Fluted foot", (0, 0, 0.2), (0, 0, 0.75), 0.15, "Iron", 0.10, 16)
rod("Lamp shaft", (0, 0, 0.7), (0, 0, 2.7), 0.071, "Iron", 0.045, 16)
for z in (0.8, 2.45, 2.7):
    rod("Cast collar", (0, 0, z), (0, 0, z + 0.055), 0.11, "Iron", vertices=16)
box("Lantern base", (0, 0, 2.77), (0.38, 0.38, 0.09), "Iron", 0.015)
box("Amber glass", (0, 0, 3.04), (0.24, 0.24, 0.42), "LampGlass", 0.015)
for x in (-0.16, 0.16):
    for y in (-0.16, 0.16):
        rod(
            "Lantern mullion",
            (x, y, 2.80),
            (x * 0.82, y * 0.82, 3.28),
            0.021,
            "Iron",
            vertices=8,
        )
rod("Pitched lantern cap", (0, 0, 3.26), (0, 0, 3.49), 0.27, "Iron", 0.035, 4)
rod("Finial", (0, 0, 3.44), (0, 0, 3.65), 0.025, "Iron", 0.002, 8)
export("Lamp")

# Rubble sits around boundaries; the combat lane stays free of hidden blockers.
for i in range(42):
    x, y = random.uniform(-1.4, 1.4), random.uniform(-0.6, 0.6)
    height = 0.10 + 0.2 * max(0, 1 - abs(x))
    stone(
        "Broken masonry",
        (x, y, height),
        (random.uniform(0.12, 0.4), random.uniform(0.10, 0.3), height),
        "Brick" if i % 3 == 0 else "Stone",
    )
for i in range(5):
    x = random.uniform(-1.0, 1.0)
    rod("Exposed rebar", (x, -0.4, 0.1), (x + 0.4, 0.3, 0.5), 0.018, "Rust", vertices=6)
export("Rubble")

# Ruined London masonry module: recessed windows, cornices, broken upper profile.
box("Facade wall", (0, 0, 2.2), (5.5, 0.55, 4.4), "Brick", 0.045)
for z in (0.24, 2.35, 4.3):
    box("Stone cornice", (0, -0.12, z), (5.72, 0.8, 0.18), "Stone", 0.025)
for x in (-1.8, 0, 1.8):
    for z in (1.25, 3.3):
        box("Soot black window", (x, -0.285, z), (0.94, 0.025, 1.35), "Glass", 0.01)
        for side in (-1, 1):
            box(
                "Window jamb",
                (x + side * 0.53, -0.32, z),
                (0.13, 0.17, 1.55),
                "Stone",
                0.02,
            )
        for dz in (-0.75, 0.75):
            box("Window lintel", (x, -0.35, z + dz), (1.18, 0.23, 0.13), "Stone", 0.015)
        box("Broken sash", (x, -0.34, z), (0.045, 0.04, 1.3), "Iron", 0.005)
        box("Window crossbar", (x, -0.34, z + 0.15), (0.9, 0.04, 0.04), "Iron", 0.005)
for i in range(10):
    x = -2.5 + i * 0.55
    box(
        "Shattered parapet",
        (x, 0, 4.45 + random.uniform(0, 0.3)),
        (0.48, 0.56, random.uniform(0.18, 0.6)),
        "Brick",
        0.025,
    )
export("Facade")

# Thames balustrade module with cast railings and stone endposts.
box("River parapet base", (0, 0, 0.22), (4.0, 0.48, 0.44), "Stone", 0.035)
for x in (-1.86, 1.86):
    box("Stone post", (x, 0, 0.78), (0.38, 0.44, 1.3), "Stone", 0.025)
    box("Post cap", (x, 0, 1.45), (0.52, 0.58, 0.12), "Stone", 0.035)
for x in [i * 0.24 for i in range(-7, 8)]:
    rod("Iron baluster", (x, 0, 0.4), (x, 0, 1.28), 0.026, "Iron", vertices=8)
    rod("Spear top", (x, 0, 1.28), (x, 0, 1.40), 0.048, "Iron", 0, 6)
for z in (0.6, 1.2):
    box("Handrail", (0, 0, z), (3.8, 0.09, 0.07), "Iron", 0.01)
export("Railing")

# Supplies and burning brazier accents, reused around the checkpoint.
box("Timber ammunition crate", (0, 0, 0.34), (0.95, 0.64, 0.68), "Canvas", 0.04)
for x in (-0.36, 0.36):
    box("Iron packing strap", (x, 0, 0.345), (0.04, 0.65, 0.70), "Iron", 0.005)
for z in (0.15, 0.36, 0.57):
    box("Board seam", (0, -0.323, z), (0.89, 0.006, 0.013), "Rubber", 0)
export("Crate")
rod("Burnt oil drum", (0, 0, 0.05), (0, 0, 0.87), 0.31, "Rust", vertices=24)
for z in (0.12, 0.4, 0.74):
    rod("Rolled drum rib", (0, 0, z), (0, 0, z + 0.035), 0.325, "Iron", vertices=24)
rod("Coal bed", (0, 0, 0.873), (0, 0, 0.878), 0.28, "Rubber", vertices=24)
for i in range(7):
    x, y = random.uniform(-0.18, 0.18), random.uniform(-0.18, 0.18)
    rod(
        "Glowing ember",
        (x, y, 0.89),
        (x + 0.05, y - 0.03, random.uniform(0.98, 1.15)),
        0.06,
        "LampGlass",
        0.008,
        7,
    )
export("FireDrum")

# A distant clock tower supplies a London silhouette; it is scenery, not a route.
box("Clock tower shaft", (0, 0, 7), (2.6, 2.6, 14), "Stone", 0.05)
for z in (1, 4, 7, 10, 13, 15):
    box("Tower cornice", (0, 0, z), (2.95, 2.95, 0.24), "Stone", 0.04)
for x in (-1.2, 1.2):
    for y in (-1.2, 1.2):
        box("Tower corner pier", (x, y, 7), (0.3, 0.3, 14), "Stone", 0.03)
for side in (-1, 1):
    for x in (-0.65, 0, 0.65):
        box(
            "Gothic tower opening",
            (x, side * 1.312, 10.8),
            (0.31, 0.035, 2.2),
            "Glass",
            0.02,
        )
    rod(
        "Clock face",
        (0, side * 1.32, 13.8),
        (0, side * 1.39, 13.8),
        0.91,
        "RoadPaint",
        vertices=40,
    )
    for i in range(12):
        a = i * math.tau / 12
        x, z = math.sin(a) * 0.74, 13.8 + math.cos(a) * 0.74
        obj = box(
            "Clock hour marker",
            (x, side * 1.40, z),
            (0.045, 0.015, 0.13),
            "Iron",
            0.005,
        )
        obj.rotation_euler.y = a
    rod(
        "Clock minute hand",
        (0, side * 1.42, 13.8),
        (0.25, side * 1.42, 14.37),
        0.025,
        "Iron",
        vertices=8,
    )
    rod(
        "Clock hour hand",
        (0, side * 1.43, 13.8),
        (-0.38, side * 1.43, 13.77),
        0.035,
        "Iron",
        vertices=8,
    )
rod("Blackened tower roof", (0, 0, 15), (0, 0, 18.5), 2.12, "Iron", 0.2, 4)
rod("Tower spire", (0, 0, 18.3), (0, 0, 20), 0.18, "Iron", 0.015, 8)
export("ClockTower")

assert sum(r["triangles"] for r in reports) < 100000
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "art/london/london-kit.blend"))
(ROOT / "art/london/kit-report.json").write_text(json.dumps(reports, indent=2) + "\n")
(ROOT / "art/london/materials.json").write_text(
    json.dumps(
        {
            "materials": [
                {
                    "name": name,
                    "color": spec[0],
                    "metal": spec[1],
                    "smooth": spec[2],
                    "texture": spec[3],
                }
                for name, spec in SPEC.items()
            ]
        },
        indent=2,
    )
    + "\n"
)
print(
    "LONDON_KIT_PASS",
    len(reports),
    "assets",
    sum(r["triangles"] for r in reports),
    "triangles",
)
