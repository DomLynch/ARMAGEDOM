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
# Bake a relaxed tool grip into right-hand anatomy; this rig has no finger bones.
# Only donor finger geometry changes. Target rig and every animation remain intact.
for finger in ("index", "middle", "ring", "pinky"):
    ids = [names.index(finger + "_0" + str(k) + "_r") for k in (1, 2, 3)]
    root = donor["heads"][ids[0]].astype(float)
    direction = donor["tails"][ids[2]] - root
    direction /= np.linalg.norm(direction)
    width = donor["heads"][names.index("index_01_r")] - donor["heads"][names.index("pinky_01_r")]
    normal = np.cross(width, direction)
    normal /= np.linalg.norm(normal)
    if normal[0] < 0:
        normal *= -1
    axis = np.cross(direction, normal)
    axis /= np.linalg.norm(axis)
    transform = np.eye(3)
    new_head = root.copy()
    original_head = root.copy()
    for k, bone_i in enumerate(ids):
        turn = np.array(Quaternion(Vector(axis), math.radians([55, 65, 45][k])).to_matrix())
        transform = turn @ transform
        influence = source_weights[:, bone_i]
        corrected = (source - original_head) @ transform.T + new_head
        # Each donor vertex may blend fingers/palm; displace only its influence.
        source += (corrected - source) * influence[:, None]
        segment = donor["tails"][bone_i] - donor["heads"][bone_i]
        new_head += transform @ segment
        original_head = donor["tails"][bone_i]
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

# Normalize and bound runtime influences without blending independent layers.
for row in weights:
    row[np.argsort(row)[:-4]] = 0
weights /= weights.sum(1)[:, None]
assert np.isfinite(fitted).all()
fitted[:, 2] -= min(0, fitted[:, 2].min())
normals = np.zeros_like(fitted)
cross = np.cross(fitted[tris[:, 1]] - fitted[tris[:, 0]], fitted[tris[:, 2]] - fitted[tris[:, 0]])
for k in range(3):
    np.add.at(normals, tris[:, k], cross)
normals /= np.maximum(np.linalg.norm(normals, axis=1)[:, None], 1e-9)
tree = KDTree(len(fitted))
for i, point in enumerate(fitted):
    tree.insert(Vector(point), i)
tree.balance()
created = []


def material(name, colour, roughness=.85, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*colour, 1)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    p = nodes.get("Principled BSDF")
    p.inputs["Roughness"].default_value = roughness
    p.inputs["Metallic"].default_value = metallic
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Wear"
    links.new(attr.outputs["Color"], p.inputs["Base Color"])
    return mat


def make(name, verts, faces, skin_weights, colour, metallic=0):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.parent = rig
    mod = obj.modifiers.new("Original rig", "ARMATURE")
    mod.object = rig
    for j, bone in enumerate(bone_names):
        group = obj.vertex_groups.new(name=bone)
        for v, value in enumerate(skin_weights[:, j]):
            if value > 1e-7:
                group.add([v], float(value), "REPLACE")
    for p in mesh.polygons:
        p.use_smooth = True
    mat = material(name, colour, .8 if metallic == 0 else .48, metallic)
    mesh.materials.append(mat)
    colours = mesh.color_attributes.new(name="Wear", type="FLOAT_COLOR", domain="CORNER")
    for loop in mesh.loops:
        v = mesh.vertices[loop.vertex_index].co
        noise = math.sin(v.x * 143 + v.y * 79 + v.z * 107) * math.sin(v.z * 71 - v.x * 37)
        broad = .5 + .5 * math.sin(v.x * 21 + v.z * 13 + v.y * 9)
        factor = .88 + (.02 if name == "Vagrant body" else .07) * noise + .07 * broad
        if name == "Torso jacket" and v.y < -.04 and abs(v.x) < .055:
            base = (.15, .19, .22)  # visible hoodie/centre panel
        else:
            base = colour
        dirt = .85 if v.z < .20 else 1
        colours.data[loop.index].color = (*[max(0, min(1, c * factor * dirt)) for c in base], 1)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=.015)
    bpy.ops.object.mode_set(mode="OBJECT")
    created.append(obj)
    return obj


def shell(name, mask, offset, colour):
    selected_faces = tris[np.all(mask[tris], axis=1)]
    used = np.unique(selected_faces)
    indices = np.full(len(source), -1)
    indices[used] = np.arange(len(used))
    v = fitted[used].copy() + normals[used] * offset
    if name == "Torso jacket":
        # Loose waist, restrained folds; retain fitted shoulder and arm anatomy.
        waist = np.exp(-((v[:, 2] - 1.20) / .22) ** 2)
        waist *= np.clip(1 - arm[used] * 4, 0, 1)  # torso ease must not shift sleeves away from arms
        v[:, 0] *= 1 + .16 * waist
        v[:, 1] += normals[used, 1] * .025 * waist
        folds = .003 * np.sin(v[:, 2] * 87 + v[:, 0] * 23)
        v += normals[used] * folds[:, None]
    if name == "Legs trousers":
        v += normals[used] * (.003 * np.sin(v[:, 2] * 65 + v[:, 0] * 45))[:, None]
    if name == "Feet boots":
        # A proper boot sole; floor plane is unchanged.
        v[:, 2] = np.maximum(v[:, 2], .012)
    return make(name, v, indices[selected_faces], weights[used], colour)


z = source[:, 2]
hand = sum(source_weights[:, i] for i, n in enumerate(names) if mapping[n].startswith("Hand"))
arm = sum(source_weights[:, i] for i, n in enumerate(names) if mapping[n].startswith(("UpperArm", "Forearm", "Clavicle")))
head = source_weights[:, names.index("head")] + source_weights[:, names.index("neck_01")]
skin_mask = z > .11  # Continuous covered human base; closes cuffs and permits future garment swaps.
shell("Vagrant body", skin_mask, 0, (.47, .32, .24))
torso_mask = ((z > .85) & (z < 1.445) & (hand < .5)) | ((arm > .25) & (hand < .55))
shell("Torso jacket", torso_mask, .020, (.22, .25, .16))
shell("Legs trousers", (z < .905) & (z > .10) & (hand < .1), .026, (.12, .14, .15))
boot_v, boot_f, boot_w = [], [], []
for side in (-1, 1):
    start = len(boot_v)
    for level, height in enumerate((.012, .030, .070, .110, .170, .245)):
        for i in range(32):
            angle = math.tau * i / 32
            radius_x = .068 if level < 4 else .055
            radius_y = .155 if level < 3 else .12 if level == 3 else .065
            centre_y = -.095 if level < 3 else -.055 if level == 3 else .015
            boot_v.append((side * .17 + radius_x * math.cos(angle), centre_y + radius_y * math.sin(angle), height))
            w = np.zeros(len(bone_names));w[bone_names.index("Foot." + ("L" if side > 0 else "R"))] = 1
            boot_w.append(w)
    for level in range(5):
        for i in range(32):
            a = start + level * 32 + i
            b = start + level * 32 + (i + 1) % 32
            boot_f.append((a, b, b + 32, a + 32))
    boot_f.append(tuple(start + i for i in range(31, -1, -1)))
make("Feet boots", boot_v, boot_f, np.array(boot_w), (.20, .125, .075))

# Hair is a fitted scalp subset, avoiding a second face/helmet assembly.
hair_mask = (z > 1.61) & ((source[:, 1] > -.095) | (z > 1.675))
shell("Hair", hair_mask, .008, (.055, .045, .034))


def nearest_weights(points):
    return np.array([weights[tree.find(Vector(p))[1]] for p in points])


def rigid_weights(count, bone):
    w = np.zeros((count, len(bone_names)))
    w[:, bone_names.index(bone)] = 1
    return w


def box(name, center, size, colour, bone=None, bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = obj.modifiers.new("Rounded construction", "BEVEL")
    mod.width = bevel
    mod.segments = 2
    bpy.ops.object.modifier_apply(modifier=mod.name)
    verts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    faces = [p.vertices[:] for p in obj.data.polygons]
    bpy.data.objects.remove(obj, do_unlink=True)
    w = rigid_weights(len(verts), bone) if bone else nearest_weights(verts)
    return make(name, verts, faces, w, colour)


def front_at(x, z):
    ids = np.where((np.abs(fitted[:, 0] - x) < .035) & (np.abs(fitted[:, 2] - z) < .035))[0]
    return float(fitted[ids, 1].min() - .024) if len(ids) else -.14


# Jacket patch pockets, knee repair, and zipper are distinct mesh pieces with
# fitted weights. Their dimensions are contemporary garment construction.
for side in (-1, 1):
    x = side * .125
    box("Jacket pocket " + str(side), (x, front_at(x, 1.23), 1.23), (.105, .025, .125), (.18, .205, .13))
    box("Pocket flap " + str(side), (x, front_at(x, 1.30) - .012, 1.30), (.112, .02, .034), (.24, .27, .18))
box("Knee repair", (.155, front_at(.155, .56) - .022, .56), (.115, .018, .14), (.28, .25, .19))
# Hood-down collar: draped ring behind and beside the neck, shared chest weights.
hood_v, hood_f = [], []
for j in range(7):
    t = j / 6
    for i in range(25):
        angle = i / 24 * math.tau
        hood_v.append((math.cos(angle) * (.10 + t * .10),
                       .035 + math.sin(angle) * (.10 + t * .06),
                       1.59 - t * .095 + .025 * math.sin(angle)))
for j in range(6):
    for i in range(24):
        a = j * 25 + i
        hood_f.append((a, a + 1, a + 26, a + 25))
make("Hood down", hood_v, hood_f, nearest_weights(hood_v), (.15, .19, .22))

# Vest and backpack are optional equipment, visible in authoring but disabled in
# the starting Unity outfit. Vest follows torso weights; bag follows Chest.
vest_v, vest_f = [], []
for ring, (height, width, depth) in enumerate(((1.08, .22, .155), (1.27, .23, .17), (1.48, .215, .16))):
    for i in range(32):
        angle = i * math.tau / 32
        vest_v.append((width * math.cos(angle), .035 + depth * math.sin(angle), height))
for ring in range(2):
    for i in range(32):
        a = ring * 32 + i; b = ring * 32 + (i + 1) % 32
        vest_f.append((a, b, b + 32, a + 32))
make("Protection vest", vest_v, vest_f, nearest_weights(vest_v), (.28, .25, .18))
for side in (-1, 1):
    box("Vest shoulder " + str(side), (side * .15, .035, 1.49), (.065, .28, .05), (.28, .25, .18), "Chest", .012)
box("Backpack", (0, .255, 1.40), (.32, .18, .38), (.20, .17, .12), "Chest", .035)
box("Backpack pocket", (0, .36, 1.34), (.24, .07, .19), (.24, .205, .145), "Chest", .018)
for side in (-1, 1):
    box("Backpack strap " + str(side), (side * .145, .155, 1.52), (.038, .12, .18), (.105, .09, .07), "Chest", .008)
box("Belt pouch", (.225, -.08, 1.025), (.11, .07, .12), (.21, .14, .08), "Hips", .012)

# Machete uses the original sword's hand-side construction direction. Its handle
# occupies the unchanged right grip and the broad blade remains a separate mesh.
handbone = rig.data.bones["Hand.R"]
origin = np.array((handbone.head_local.x, -.06, .94))
blade_outline = [(-.027, .005), (-.027, .37), (-.005, .455), (.025, .49),
                 (.060, .465), (.064, .35), (.044, .005)]
blade_v = []
for depth in (-.003, .003):
    for x, length in blade_outline:
        blade_v.append(origin + np.array((x, -.69 * length + depth, -.11 - .73 * length)))
n = len(blade_outline)
blade_f = [tuple(range(n - 1, -1, -1)), tuple(range(n, n * 2))]
for i in range(n):
    blade_f.append((i, (i + 1) % n, (i + 1) % n + n, i + n))
make("Machete", blade_v, blade_f, rigid_weights(len(blade_v), "Hand.R"), (.38, .41, .43), .72)
box("Machete handle", origin + (0, 0, -.04), (.034, .032, .15), (.13, .085, .045), "Hand.R", .008)
for i in range(5):
    box("Handle binding " + str(i), origin + (0, 0, -.09 + i * .022), (.038, .036, .008), (.27, .24, .18), "Hand.R", .002)

# Eye colour patches follow the actual warped donor surface. Hard-coded eyes
# floated after the continuous fit; thin fitted patches avoid separate eyeball
# geometry protruding through the eyelids during original clips.
for side in (-1, 1):
    donor_eye = np.array((side * .034, -.145, 1.624))
    index = np.argmin(np.linalg.norm(source - donor_eye, axis=1))
    centre = fitted[index] + normals[index] * .0008
    for label, width, height, depth, colour in [
        ("Eye", .012, .0038, 0, (.38, .36, .30)),
        ("Pupil", .003, .0034, .0008, (.035, .032, .025))]:
        verts = [centre + normals[index] * depth + np.array((x, 0, z))
                 for x, z in ((-width, -height), (width, -height), (width, height), (-width, height))]
        make(label + str(side), verts, [(0, 1, 2, 3)], rigid_weights(4, "Head"), colour)

# Consolidate detail into its owning equipment piece before packing/baking. This
# preserves vertex colours/weights while keeping runtime materials and meshes few.
groups = {
    "Vagrant body": lambda n: n == "Hair" or n.startswith(("Eye", "Pupil")),
    "Torso jacket": lambda n: n.startswith(("Jacket pocket", "Pocket flap", "Zipper")) or n == "Hood down",
    "Legs trousers": lambda n: n in ("Knee repair", "Belt pouch"),
    "Protection vest": lambda n: n.startswith("Vest shoulder"),
    "Backpack": lambda n: n.startswith(("Backpack pocket", "Backpack strap")),
    "Machete handle": lambda n: n.startswith("Handle binding"),
}
for owner, belongs in groups.items():
    anchor = next(o for o in created if o.name == owner)
    parts = [o for o in created if o == anchor or belongs(o.name)]
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = anchor
    bpy.ops.object.join()
    mat = anchor.data.materials[0]
    anchor.data.materials.clear()
    anchor.data.materials.append(mat)
    for poly in anchor.data.polygons:
        poly.material_index = 0
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=.015)
    bpy.ops.object.mode_set(mode="OBJECT")
    created = [o for o in bpy.data.objects if o.type == "MESH"]

# Bake vertex-authored colour into explicit albedo images, one per material.
# The atlas is selected explicitly; lighting remains the game's responsibility.
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 1
scene.render.threads_mode = "FIXED"
scene.render.threads = 8
scene.render.bake.margin = 8
for obj in created:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    mat = obj.data.materials[0]
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    p = nodes.get("Principled BSDF")
    output = nodes.get("Material Output")
    attr = next(n for n in nodes if n.type == "VERTEX_COLOR")
    emission = nodes.new("ShaderNodeEmission")
    links.new(attr.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs[0], output.inputs["Surface"])
    # Small detail pieces share flat colour; larger surfaces receive full atlas.
    size = 1024 if len(obj.data.vertices) > 500 else 128
    image = bpy.data.images.new(obj.name + " Albedo", width=size, height=size, alpha=False)
    image.filepath_raw = str(OUT / (obj.name.replace(" ", "_") + "Albedo.png"))
    image.file_format = "PNG"
    node = nodes.new("ShaderNodeTexImage")
    node.image = image
    nodes.active = node
    bpy.ops.object.bake(type="EMIT", uv_layer=obj.data.uv_layers.active.name)
    image.save()
    image.pack()
    links.new(p.outputs[0], output.inputs["Surface"])
    links.new(node.outputs["Color"], p.inputs["Base Color"])
    nodes.remove(emission)

rig.data.pose_position = "POSE"
scene.frame_start, scene.frame_end = 1, 104
scene.frame_set(1)
for obj in created:
    obj.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "candidate.blend"))
bpy.ops.export_scene.fbx(filepath=str(OUT / "Vagrant.fbx"), use_selection=True,
    object_types={"MESH", "ARMATURE"}, axis_forward="-Z", axis_up="Y",
    apply_scale_options="FBX_SCALE_ALL", global_scale=1, add_leaf_bones=False,
    bake_space_transform=False, bake_anim=True, bake_anim_step=.25,
    bake_anim_use_all_actions=False, bake_anim_use_nla_strips=False,
    bake_anim_simplify_factor=0, path_mode="STRIP")
manifest = {"rig": rig.name, "bones": bone_names, "rest_matrices": rest_matrices,
            "source_sha256": hashlib.sha256((ROOT / "inputs/rig.blend").read_bytes()).hexdigest(),
            "fbx_sha256": hashlib.sha256((OUT / "Vagrant.fbx").read_bytes()).hexdigest(),
            "pieces": [{"name": o.name, "vertices": len(o.data.vertices), "material": o.data.materials[0].name} for o in created],
            "gpu_calls": 0, "status": "unreviewed pilot"}
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
print("VAGRANT_BUILD_COMPLETE", json.dumps(manifest), flush=True)
