"""Read-only Blender checks for the modular pilot and original motion source."""
import hashlib
import json
from pathlib import Path
import sys
import bpy
import numpy as np

ROOT = Path(__file__).resolve().parent
FRAMES = [1, 15, 30, 45, 60, 61, 64, 68, 72, 76, 80, 84, 85, 89, 94, 99, 104]


def skeleton_samples(path):
    bpy.ops.wm.open_mainfile(filepath=str(path), use_scripts=False)
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    rest = {b.name: np.array(b.matrix_local) for b in rig.data.bones}
    samples = []
    for frame in FRAMES:
        bpy.context.scene.frame_set(frame)
        samples.append({b.name: np.array(b.matrix) for b in rig.pose.bones})
    return rest, samples


def validate():
    candidate = ROOT / "output/candidate.blend"
    assert candidate.is_file(), "modular survivor candidate has not been built"
    original, poses = skeleton_samples(ROOT / "inputs/rig.blend")
    current, fitted = skeleton_samples(candidate)
    assert original.keys() == current.keys(), "original skeleton hierarchy changed"
    error = max(float(np.max(np.abs(original[n] - current[n]))) for n in original)
    pose_error = max(float(np.max(np.abs(a[n] - b[n]))) for a, b in zip(poses, fitted) for n in original)
    assert error < 1e-7 and pose_error < 1e-7, (error, pose_error)
    required = {"Vagrant body", "Torso jacket", "Legs trousers", "Feet boots", "Machete", "Protection vest", "Backpack"}
    meshes = {o.name: o for o in bpy.data.objects if o.type == "MESH"}
    assert required <= meshes.keys(), required - meshes.keys()
    assert not meshes["Protection vest"].hide_render and not meshes["Backpack"].hide_render
    results = []
    for name, obj in meshes.items():
        assert obj.data.uv_layers, name + " missing UV"
        assert obj.data.materials, name + " missing materials"
        verts = np.array([v.co[:] for v in obj.data.vertices])
        assert np.isfinite(verts).all(), name + " nonfinite vertices"
        for v in obj.data.vertices:
            total = sum(g.weight for g in v.groups)
            assert abs(total - 1) < .002, (name, v.index, total)
        obj.data.calc_loop_triangles()
        tris = np.array([t.vertices[:] for t in obj.data.loop_triangles])
        edges = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
        reference = None
        stretch = 0
        for frame in FRAMES:
            bpy.context.scene.frame_set(frame)
            evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh = evaluated.to_mesh()
            positions = np.array([evaluated.matrix_world @ v.co for v in mesh.vertices])
            assert np.isfinite(positions).all(), (name, frame)
            lengths = np.linalg.norm(positions[edges[:, 0]] - positions[edges[:, 1]], axis=1)
            if reference is None:
                reference = lengths
            stretch = max(stretch, float(np.max(lengths - reference)))
            evaluated.to_mesh_clear()
        assert stretch < .2, (name, "posed triangle expansion", stretch)
        results.append({"name": name, "vertices": len(verts), "triangles": len(tris), "maximum_edge_expansion_m": stretch})
    report = {"status": "PASS", "rig_bones": len(current), "rest_matrix_error": error,
              "pose_matrix_error": pose_error, "sample_frames": FRAMES, "pieces": results,
              "candidate_sha256": hashlib.sha256(candidate.read_bytes()).hexdigest(),
              "limits": "Sampled geometry/rig check; visible seams, native clearance and export behaviour require review."}
    (ROOT / "output/validation.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report))


if __name__ == "__main__":
    validate()
