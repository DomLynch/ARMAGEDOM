> Historical engine reference only — 2026-10-04: Unity is retired; Game/ and engine commands are privately archived and must not be reactivated. Consult canonical AGENTS.md and briefs/THREEJS-ONLY-RETIREMENT.md for active Three.js work.

# Original Warden hero — 2026-10-02

Original dark gothic knight concept -> image-to-3D -> CPU rig/material conversion ->
real native Unity hero. Enemy art is outside this pass.

## Evidence and sources

- `warden-reference.png`: original built-in image generation, not a downloaded character.
- `warden-source.glb`: Microsoft TRELLIS.2, seed 28419, 1536 geometry mode, target 200K
  triangles, 4096 PBR texture atlas. Previous 1024 candidate retained for comparison.
- `warden-rigged.blend`: original 19-bone rig, region-constrained skin weights,
  104 authored frames, custom Ashblade sword. Hero body height: 1.95 m.
- Runtime: `Game/Assets/Resources/Hero/Warden.fbx`, explicit Standard materials,
  4K albedo, metallic (R)/smoothness (A), and subtle albedo-derived micro normal.
  Micro normal is supplemental detail, not a high-poly sculpt normal bake.
- `artifacts/hero/zero-quota.json`: included quota remaining 2272.6 GPU-seconds,
  `overquotaUsed: 0` after both successful reconstruction runs. No paid HF Job.
- Before/after/strike captures are actual Unity camera output in `artifacts/hero`.

Current official guidance consulted:

- [Unity 6.3 Standard metallic/smoothness](https://docs.unity.com/en-us/engine/6000.3/manual/materials-and-shaders/built-in/shader-built-in-configure-properties/standard-shader-material-parameter-metallic)
- [Unity 6.3 texture importer](https://docs.unity.com/en-us/engine/6000.3/script-reference/unityeditor/textureimporter)
- [Unity 6.3 Mac Retina](https://docs.unity3d.com/6000.3/Documentation/Manual/PlayerSettings-macOS.html)
- [TRELLIS.2 requirements](https://github.com/microsoft/TRELLIS.2)
- [Official demo implementation](https://huggingface.co/spaces/microsoft/TRELLIS.2/raw/main/app.py)
- [HF CPU pricing](https://huggingface.co/docs/hub/main/en/jobs-pricing)
- [ZeroGPU quota and overage](https://huggingface.co/docs/hub/en/spaces-zerogpu)

## Reproduce without new remote generation

From the Ashvault repository root, run:

```bash
"/Applications/Blender.app/Contents/MacOS/Blender" --background --threads 4 --python art/hero/rig_warden.py
```

Refresh Unity, then use the editor menu `Ashvault/Import original Warden`. Test with
`python3 scripts/verify.py`, build Mac, and run `python3 scripts/smoke_mac.py`.
`V` inspects the same model used in combat.

`reconstruct.py` is an explicit optional remote regeneration command; it is never
an automatic quality gate. It checks included quota before generation/extraction
and saves before/after quota. Authenticated ZeroGPU can charge prepaid overage;
never equate the Zero label with an unlimited-free service. Do not run concurrent
quota-consuming workloads under a zero-spend constraint. No paid GPU job fallback.

## Closed failures and remaining quality limits

- Initial Gradio inference failed with generic AppError: passing the prepared image
  through `handle_file` resolved it; same client retained server-side latent state.
- Packed WebP saved under PNG extension was unreadable by Unity. Re-encode pixel
  data into a new actual PNG; checking filename alone is insufficient.
- Resolve source images through the Principled shader inputs, not image-node order.
  glTF ORM uses B for metal and G for roughness; Unity uses R for metal and A for
  smoothness (`1 - roughness`). Keep these data maps out of sRGB conversion.
- Close-up initially viewed the back: orbit relative to player heading.
- Shoulder weighting used a hard region boundary. Blend through chest/clavicle/arm
  around the shoulder; visually check an extreme strike after each rig revision.
- The old Flare hero and its unused runtime maps were removed. Its enemy sources remain.
- This is a reconstructed pilot with procedural animation, not a claim of shipped
  AAA-quality topology, mocap or perfect joints. Fingers/underarm deformation and
  the simple sword remain refinement candidates. User judges the 9/10 visual target.

Reusable workflow: [unity-blender-cpu-art skill](/Users/domininclynch/.codex/skills/unity-blender-cpu-art/SKILL.md),
with a supporting reference for original heroes, guarded reconstruction and PBR import.
