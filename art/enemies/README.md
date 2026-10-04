> Historical engine reference only — 2026-10-04: Unity is retired; Game/ and engine commands are privately archived and must not be reactivated. Consult canonical AGENTS.md and briefs/THREEJS-ONLY-RETIREMENT.md for active Three.js work.

# Ash Revenant — original enemy pilot, 2026-10-02

Original enemy reference generated with the built-in image tool, then reconstructed
using the official Microsoft TRELLIS.2 shared demo. No purchased model or paid Job.
The 32 GB CPU tier cannot run TRELLIS GPU inference: only the included demo quota was
used, guarded before inference and extraction. Before/after overquotaUsed both zero.

Files: `revenant-reference.png`, `revenant-source.glb`, `revenant-rigged.blend`.
Settings and quota: `generation.json`, `quota-receipt.json`. 1536 reconstruction,
100K target mesh, actual 96,935 triangles, 4096px PBR maps, original 19-bone CPU rig.
Body albedo and metallic/smoothness are reconstructed. Micro normal is supplemental
albedo-derived detail, not a sculpt bake. Weapon is original procedural geometry.
Regulars, veterans and captain share this mesh; scale and combat behavior differ.

Original prompt: photoreal full-body ashen undead medieval warrior, bare scarred head,
corroded iron cuirass, burgundy leather waist strips, bracers/greaves, neutral separated
A-pose, realistic proportions, transparent background, no weapon/cape/cartoon styling.

## Reproduce locally

From the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 4 --python art/hero/rig_warden.py -- --name Revenant --folder Enemies --source art/enemies/revenant-source.glb
```

Refresh Unity and run `Ashvault.Editor.HeroImport.SetupRevenant()` through Unity CLI.
Use the project quality gates, then inspect the same native gameplay model.
Do not regenerate remotely just to change weights or animations.

## Evidence and failures

- First extraction rejected 70K triangles: live demo minimum is100K. Corrected request
  exported a complete GLB. Reusable runner now validates before consuming quota.
- `/end_session` is not exposed by the current Gradio API. Export and quota receipt
  were already saved; cleanup now uses Client.close(). No additional inference needed.
- Import eval timeout did not cancel import: a subsequent read proved4K material and
  three clips. Read actual asset state before retrying an expensive import.
- First strike showed wrist stretching from hard region weights. New mesh uses fitted
  narrower arm bones and continuous nearest-bone blending. Reviewed strike/run poses;
  final weights then passed imported animation checks. A regression caught the joined
  skirt separating across the x=0 weight boundary; including both sides in the four
  nearest influences reduced sampled worst edge extension from0.278m to0.105m.
  The imported Unity animation test now passes unchanged at its0.2m limit.

[Official demo](https://huggingface.co/spaces/microsoft/TRELLIS.2/blob/main/app.py)
and [quota documentation](https://huggingface.co/docs/hub/en/spaces-zerogpu).

## Current model research — 2026-10-02

Independent research agent and primary-source review confirmed available releases:

- [TRELLIS.2](https://github.com/microsoft/TRELLIS.2): current1536/PBR foundation;
  local inference requires NVIDIA24GB or more. Used for this asset.
- [Pixal3D](https://github.com/TencentARC/Pixal3D):2026 reconstruction alternative
  based on TRELLIS.2, with multiview code requiring consistent views and camera
  transforms. Not run; not proven superior on this character.
- [SkinTokens/TokenRig](https://github.com/VAST-AI-Research/SkinTokens):2026
  UniRig successor supporting existing-skeleton skinning and texture/scale transfer;
  local inference needs NVIDIA14GB or more. Not run; hosted skin-only API parity
  and included quota would need checking before a guarded comparison.

Official demos appeared Running on Zero during research. That is availability, not
proof of free inference or successful results. No verified2027 release is claimed.
Rig deformation, grounded animation, sculpted normals and material response are more
useful next quality targets than texture upscaling. Current micro normals do not
replace a high-to-low sculpt bake. No claim of AAA/world-class finished fidelity.

## Final native delivery

11/11 tests passed; build_abad3e36cc5c succeeded with zero errors. Native startup
passed. Three enemies killed with abilities, loot appeared, death/restart worked.
Receipt: artifacts/revenant-native-combat-14.png. Single-click enemy attack is
verified by InputSystem regression; separate native acceptance remains.
