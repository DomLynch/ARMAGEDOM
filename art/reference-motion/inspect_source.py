import bpy, json
from pathlib import Path

base = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(base / "mesh2motion-human-base.glb"))
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
print(
    "RIG",
    rig.name,
    "matrix",
    list(map(list, rig.matrix_world)),
    "fps",
    bpy.context.scene.render.fps,
)
key = [
    "root",
    "pelvis",
    "spine_01",
    "spine_02",
    "spine_03",
    "thigh_l",
    "calf_l",
    "foot_l",
    "ball_l",
    "upperarm_l",
    "lowerarm_l",
    "hand_l",
]
rest = {
    n: {
        "head": list(rig.data.bones[n].head_local),
        "tail": list(rig.data.bones[n].tail_local),
        "matrix": list(map(list, rig.data.bones[n].matrix_local)),
    }
    for n in key
}
print("REST recorded")
for track in list(rig.animation_data.nla_tracks):
    rig.animation_data.nla_tracks.remove(track)
result = {}
for name in ["Walk", "Jog", "Sprint"]:
    a = bpy.data.actions.get(name)
    rig.animation_data.action = a
    if hasattr(a, "slots"):
        rig.animation_data.action_slot = a.slots[0]
    lo, hi = a.frame_range
    rows = []
    for phase in [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]:
        bpy.context.scene.frame_set(
            int(lo + (hi - lo) * phase), subframe=(lo + (hi - lo) * phase) % 1
        )
        bpy.context.view_layer.update()
        rows.append(
            {
                "phase": phase,
                **{
                    n: [
                        round(x, 5) for x in (rig.matrix_world @ rig.pose.bones[n].head)
                    ]
                    for n in ["root", "pelvis", "foot_l", "ball_l", "foot_r", "ball_r"]
                },
            }
        )
    result[name] = {
        "frames": [lo, hi],
        "duration": (hi - lo) / bpy.context.scene.render.fps,
        "samples": rows,
    }
    print("CLIP", name, json.dumps(result[name]))
(base / "blender-inspection.json").write_text(
    json.dumps(
        {
            "blender": bpy.app.version_string,
            "rig": rig.name,
            "matrix": list(map(list, rig.matrix_world)),
            "rest": rest,
            "clips": result,
        },
        indent=2,
    )
    + "\n"
)
