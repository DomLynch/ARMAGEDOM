"""CPU conversion of credited Flare source models into Unity FBX + albedo.
Original licenses/attribution are in vendor/flare. No embedded source scripts run.
"""

import bpy
import pathlib
import json
import numpy as np
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "art/vendor/flare"
OUT = ROOT / "Game/Assets/Resources/Gothic"
TEX = OUT / "Textures"


def convert(name, source, wanted, height, width=1):
    bpy.ops.wm.open_mainfile(filepath=str(SRC / source), use_scripts=False)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.world = None
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.name in wanted]
    assert len(meshes) == len(wanted), (name, wanted, [o.name for o in meshes])
    rigs = set()
    for o in meshes:
        for m in o.modifiers:
            if m.type == "ARMATURE" and m.object:
                rigs.add(m.object)
    for o in meshes:
        p = o.parent
        while p:
            if p.type == "ARMATURE":
                rigs.add(p)
            p = p.parent
    # Remove unrelated outfits, render-only floor/camera and weapons.
    keep = set(meshes) | rigs
    for o in list(keep):
        p = o.parent
        while p:
            keep.add(p)
            p = p.parent
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    for c in bpy.data.collections:
        c.hide_render = False
        c.hide_viewport = False
    for o in keep:
        o.hide_render = False
        o.hide_viewport = False
        o.hide_set(False)
        if o.type == "EMPTY":
            o.animation_data_clear()
            o.rotation_euler = (0, 0, 0)
    marker = {m.name: m.frame for m in scene.timeline_markers}
    first = marker.get("stance", 1)
    scene.frame_set(first)
    # Resolve downloaded textures by basename; irrelevant HDRIs are not needed for albedo baking.
    for image in bpy.data.images:
        path = SRC / "textures" / pathlib.Path(image.filepath).name
        if image.packed_file:
            continue
        if path.is_file():
            image.filepath = str(path)
            image.reload()
    # Bake base colour including Blender procedural detail, independent of source lighting.
    records = []
    for o in meshes:
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        if not o.data.uv_layers:
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(island_margin=0.025)
            bpy.ops.object.mode_set(mode="OBJECT")
        source_uv = o.data.uv_layers.active.name
        baked_uv = o.data.uv_layers.new(name="AshvaultBake")
        o.data.uv_layers.active = baked_uv
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(island_margin=0.012)
        bpy.ops.object.mode_set(mode="OBJECT")
        asset_name = name + "_" + o.name
        image = bpy.data.images.new(asset_name, width=1024, height=1024)
        for slot in o.material_slots:
            mat = slot.material.copy()
            slot.material = mat
            mat.use_nodes = True
            nodes = mat.node_tree.nodes
            links = mat.node_tree.links
            for texture_node in list(nodes):
                if (
                    texture_node.type == "TEX_IMAGE"
                    and not texture_node.inputs["Vector"].is_linked
                ):
                    uv = nodes.new("ShaderNodeUVMap")
                    uv.uv_map = source_uv
                    links.new(uv.outputs["UV"], texture_node.inputs["Vector"])
            output = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")
            bs = next(
                (
                    n
                    for kind in ["BSDF_PRINCIPLED", "BSDF_DIFFUSE", "BSDF_GLOSSY"]
                    for n in nodes
                    if n.type == kind
                ),
                None,
            )
            emission = nodes.new("ShaderNodeEmission")
            if bs:
                color = bs.inputs.get("Base Color") or bs.inputs.get("Color")
                if color and color.is_linked:
                    links.new(color.links[0].from_socket, emission.inputs["Color"])
                elif color:
                    emission.inputs["Color"].default_value = color.default_value
            else:
                emission.inputs["Color"].default_value = mat.diffuse_color
            # Muted flesh and cloth preserve details without bright cartoon greens/blues.
            hue = nodes.new("ShaderNodeHueSaturation")
            hue.inputs["Saturation"].default_value = 0.4
            if emission.inputs["Color"].is_linked:
                links.new(
                    emission.inputs["Color"].links[0].from_socket, hue.inputs["Color"]
                )
            else:
                hue.inputs["Color"].default_value = emission.inputs[
                    "Color"
                ].default_value
            links.new(hue.outputs["Color"], emission.inputs["Color"])
            links.new(emission.outputs[0], output.inputs["Surface"])
            # A missing source image must not introduce pink into the player.
            for n in nodes:
                if (
                    n.type == "TEX_IMAGE"
                    and n.image
                    and not n.image.packed_file
                    and not pathlib.Path(bpy.path.abspath(n.image.filepath)).is_file()
                ):
                    n.image = bpy.data.images.load(
                        str(TEX / "Weathered.png"), check_existing=True
                    )
            target = nodes.new("ShaderNodeTexImage")
            target.image = image
            nodes.active = target
        scene.render.bake.use_clear = True
        scene.render.bake.margin = 8
        bpy.ops.object.bake(type="EMIT", uv_layer="AshvaultBake")
        ao = bpy.data.images.new(asset_name + "_AO", width=1024, height=1024)
        for slot in o.material_slots:
            slot.material.node_tree.nodes.active.image = ao
        scene.cycles.samples = 8
        bpy.ops.object.bake(type="AO", uv_layer="AshvaultBake")
        color_pixels = np.asarray(image.pixels[:], dtype=np.float32).reshape(-1, 4)
        ao_pixels = np.asarray(ao.pixels[:], dtype=np.float32).reshape(-1, 4)
        color_pixels[:, :3] *= 0.3 + 0.7 * ao_pixels[:, :3]
        image.pixels.foreach_set(color_pixels.ravel())
        scene.cycles.samples = 1
        image.filepath_raw = str(TEX / (asset_name + ".png"))
        image.file_format = "PNG"
        image.save()
        mat = bpy.data.materials.new(asset_name)
        mat.use_nodes = True
        bs = mat.node_tree.nodes.get("Principled BSDF")
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        mat.node_tree.links.new(node.outputs["Color"], bs.inputs["Base Color"])
        metal = 0.65 if any(x in o.name for x in ["plate", "sword", "shield"]) else 0
        bs.inputs["Metallic"].default_value = metal
        bs.inputs["Roughness"].default_value = 0.58
        o.data.materials.clear()
        o.data.materials.append(mat)
        for uv in list(o.data.uv_layers):
            if uv.name != "AshvaultBake":
                o.data.uv_layers.remove(uv)
        for poly in o.data.polygons:
            poly.material_index = 0
        records.append({"material": asset_name, "metallic": metal})
    bpy.context.view_layer.update()
    points = [o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
    low = min(v.z for v in points)
    high = max(v.z for v in points)
    scale = height / (high - low)
    root = bpy.data.objects.new(name, None)
    scene.collection.objects.link(root)
    for o in list(keep):
        if not o.parent:
            o.parent = root
    root.scale = (1, 1, 1)
    root.location.z = -low
    bpy.context.view_layer.update()
    scene.frame_start = first
    scene.frame_end = first + 47 if name in ["Goblin", "Orc", "Ogre"] else first + 31
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.fbx(
        filepath=str(OUT / (name + ".fbx")),
        use_selection=True,
        object_types={"MESH", "ARMATURE", "EMPTY"},
        axis_forward="-Z",
        axis_up="Y",
        apply_scale_options="FBX_SCALE_ALL",
        global_scale=scale,
        add_leaf_bones=False,
        bake_anim=True,
        bake_anim_use_all_actions=False,
        bake_anim_use_nla_strips=False,
        bake_anim_simplify_factor=0,
        path_mode="STRIP",
    )
    return {
        "name": name,
        "source": source,
        "markers": marker,
        "materials": records,
        "height": height,
    }


jobs = [
    (
        "Knight",
        "hero.blend",
        [
            "plate_boots",
            "plate_cuirass",
            "plate_gauntlets",
            "plate_greaves",
            "plate_helm",
            "longsword",
            "shield",
        ],
        1.95,
        1,
    ),
    ("Goblin", "goblin.blend", ["Goblin", "GoblinSpear"], 1.25, 1),
    ("Orc", "hobgoblin.blend", ["Goblin", "GoblinSpear"], 1.95, 1.08),
    ("Ogre", "hobgoblin.blend", ["Goblin", "GoblinSpear"], 2.65, 1.4),
    (
        "Warlock",
        "hero.blend",
        [
            "mage_boots",
            "mage_hood",
            "mage_skirt",
            "mage_sleeves",
            "mage_vest",
            "head_bald",
            "staff",
        ],
        2.05,
        1,
    ),
    (
        "Necromancer",
        "skeleton_mage_high.blend",
        ["Skeleton", "Cape", "SkullSword"],
        2.8,
        1,
    ),
]
records = []
for job in jobs:
    records.append(convert(*job))
    (OUT / "import-data.json").write_text(json.dumps(records, indent=2))
    print("FLARE_CONVERSION_DONE", job[0], flush=True)
