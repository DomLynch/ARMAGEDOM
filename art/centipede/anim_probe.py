"""Probe the roach clips: per action, per interesting bone, the min/max of the local pose (location, euler degrees).
Run: blender -b -P anim_probe.py -- roach.glb"""
import bpy, sys, math

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=sys.argv[-1])
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
print("ANIMDATA", arm.animation_data, [a.name for a in bpy.data.actions])
names = ["root", "body", "abdomen", "thorax", "head", "leg_0L", "shin_0L", "foot_0L", "leg_1R", "leg_2L", "mandible_L", "antenna_L"]
for act in bpy.data.actions:
    arm.animation_data.action = act
    try:
        arm.animation_data.action_slot = act.slots[0]
    except Exception as e:
        pass
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    print("ACT", act.name, f0, f1, "fps", bpy.context.scene.render.fps, "mode", {b.name: b.rotation_mode for b in arm.pose.bones if b.name == "leg_0L"})
    for n in names:
        pb = arm.pose.bones[n]
        lo = [1e9] * 6
        hi = [-1e9] * 6
        for f in range(f0, f1 + 1):
            bpy.context.scene.frame_set(f)
            e = pb.matrix_basis.to_euler()
            t = pb.matrix_basis.to_translation()
            vals = [t.x, t.y, t.z, math.degrees(e.x), math.degrees(e.y), math.degrees(e.z)]
            for i, v in enumerate(vals):
                lo[i] = min(lo[i], v)
                hi[i] = max(hi[i], v)
        print("  ", n, "loc", [f"{a:.3f}..{b:.3f}" for a, b in zip(lo[:3], hi[:3])], "rotdeg", [f"{a:.0f}..{b:.0f}" for a, b in zip(lo[3:], hi[3:])])
