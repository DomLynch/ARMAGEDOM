# Offline tools review — 2026-10-02

Use an authored CC0 animation reference with the existing Blender→FBX→Unity
pipeline. Keep the original Warden skin/rig and retarget motion only. No new
runtime architecture, paid product or GPU rental is needed for this pass.

## Decisions from official sources

| Suggestion | Finding and project decision |
|---|---|
| Mesh2Motion | **Integrated the useful part:** pinned CC0 human animation GLB downloaded and imported/sampled with existing headless Blender on CPU. 87 clips include Walk, Jog and Sprint. [Source and license](https://github.com/Mesh2Motion/mesh2motion-app). Rig compatibility still needs Warden retarget validation. |
| Mesh2Motion FBX/offline | Current [release notes](https://mesh2motion.org/news) document desktop offline support and September 25 FBX 7.4 export. Older GLB-only summaries are stale. Direct source import avoids another app installation. |
| Material Maker | Real MIT procedural PBR authoring tool with macOS support. **Defer:** useful for a specific future material task; cannot improve walking. Existing Blender materials suffice now. [Official repository](https://github.com/RodZill4/material-maker). |
| Stability Blender add-on / ComfyUI | The [Stability repository](https://github.com/Stability-AI/stability-blender-addon-public) is a release/issues shell, not evidence of a maintained, HF-Pro-inclusive texture pipeline. [StableGen](https://github.com/sakalond/StableGen) is a concrete GPL bridge to ComfyUI; substantial model storage and GPU resources are recommended. **Do not install for locomotion.** Model licenses and compute costs are separate from add-on code. |
| “Hugging Face Blender Integration” | No uniquely identified official product was supplied or established by targeted search. Use existing HF Hub/Jobs plus Blender Python, rather than installing an unspecified token-handling extension. |
| Unity MCP / official asset bridges | Unity CLI/plugin already provides the required headless control; existing project import scripts handle FBX/materials. **Keep them.** No exact official Trellis→Unity collider bridge was established. Automatically adding mesh colliders to detailed character visuals would violate our gameplay/visual separation. |
| Locus | GPL-3.0-or-later agent, currently **Windows only** per [official README](https://github.com/r1n7aro/Locus). Skip on this Mac; overlaps existing automation. |
| Sentis / Inference Engine | [Unity 2.6 documentation](https://docs.unity3d.com/Packages/com.unity.ai.inference@2.6/manual/index.html) says display name changed back to **Sentis in 2.4**. It runs neural inference in Unity; does not automatically load arbitrary HF models. **Skip:** our need is offline asset authoring, not a runtime neural model. |
| QuadRemesher / retopology | [QuadRemesher is paid](https://exoside.com/quadremesher/quadremesher-buy/), so excluded. Blender's built-in [QuadriFlow](https://github.com/blender/blender/blob/main/intern/quadriflow/quadriflow_capi.cpp) is available without a purchase. Do not remesh an already weighted hero for an animation-only change: that risks UV/weight loss. |
| Trellis / TripoSR prompt advice | Cleaner input references can help reconstruction; they do not guarantee topology or motion. Official [TRELLIS.2 requirements](https://github.com/microsoft/TRELLIS.2) specify NVIDIA GPU with at least 24 GB memory. The 32 GB CPU job is appropriate for Blender baking/validation, not this GPU inference stack. No geometry regeneration needed now. |
| PanzaScope | Real MIT [architecture mapping tool](https://github.com/Panzadabira/PanzaScope) supporting C#, with dependency heuristics and optional local-model analysis. **Skip:** duplicates CodeGraph/Semble on this small project; heuristics are not proof of bad architecture. |
| QFramework / UnityStarter | [QFramework](https://github.com/liangxiegame/QFramework) is a real MIT architecture toolkit. **Skip:** replacing ten focused runtime scripts with a framework would add work without solving the reported gait. “UnityStarter” has no exact supplied repository identity; don't install an ambiguous package. |
| Cursor / another coding agent | Not needed: existing Codex and Unity tools already edit and validate the project. HF Pro does not imply a separate IDE subscription. |

## Actual integration and checks

`art/reference-motion/` now holds the pinned 5.66 MB GLB, CC0 license, source
README, SHA-256 receipt, clip/bone inventory, reproducible CPU inspection script,
and sampled rest/pose data. Import completed in Blender 5.2.1; no external code
or add-on was installed. The parent implementation has also integrated an
authored **Sprint retarget candidate** into
`Game/Assets/Resources/Hero/Warden.fbx`, preserving the original Warden mesh and
rig. This is distinct from merely downloading the reference; visual acceptance
of the resulting locomotion remains pending.

Independent CPU review of the regenerated `artifacts/motion-sprint/warden.blend`
confirmed identical mesh vertices, topology, skin weights, groups, materials,
parenting and rest matrices. An initial wrist mapping error produced 93–95°
bends; anatomical hand alignment reduced these to 14.36° left and 22.61° right,
with zero sampled joint gaps. The first boot-contact correction was discarded
by an overwritten function argument. After that fix, the same sampled weighted
boot-sole check improved from 5–9 cm penetration to a minimum of
−0.0000053 m (approximately −0.0053 mm). These are sampled geometry checks, not
proof of natural movement. The parent owns Unity runtime grounding, the full
test gate, and side/game-camera review.

The source candidates differ materially: measured Walk has restrained vertical
motion; Jog has a much stronger flight/bounce phase. Both are in-place. Target
stride must be measured from planted feet after retargeting, not guessed from
clip duration. Preserve original materials, mesh and bindings throughout.

This investigation changed only reference assets and this documentation; no
runtime/editor/test source or project/global configuration. Project-code
CodeGraph/Semble discovery was unnecessary within this asset-only lane. Main
implementation owns code discovery, quality gates and final build verification.

## Compute and cost boundary

HF Pro Jobs offers [CPU Upgrade](https://huggingface.co/docs/hub/main/en/jobs-pricing)
with 8 vCPU/32 GB at $0.03/hour; job compute is metered rather than universally
free with Pro. This research/import used local CPU only and submitted no job.
Continue using already-authorized bounded CPU Jobs when heavy bakes justify
them, and local Metal for Unity rendering. No paid product or cloud GPU added.
