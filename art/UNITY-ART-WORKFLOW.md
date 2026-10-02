# Blender → Unity art workflow

Validated scope: Ashvault, Blender 5.2, Unity 6000.3.25f1, Built-in renderer.
Last reviewed: 2026-10-02. Reuse the method; revalidate settings for other rigs.

## Start with one visible asset

1. Select one licensed, articulated character with suitable proportions and animation.
2. Import it into the real arena and inspect the actual game camera before batching.
3. Check silhouette, feet, weapon placement, textures, facing, and idle/run/attack motion.
4. Only then process the remaining characters and environment.

The procedural primitive character pass did not meet the requested grounded gothic
appearance. More primitive detail did not solve the visual direction. Keep useful
ruin geometry, but judge character art in-game before investing in a whole roster.
Gameplay roots, colliders, damage and timing remain independent of `Visual` children.

## CPU and provenance

- Use local CPU when it completes the job economically. No cloud job is required.
- If cloud compute is necessary, the owner permits the cheap 32 GB CPU tier at
  approximately $0.03/hour; verify the current tier and price before dispatch.
  Do not substitute paid GPU hardware or a GPU-only generation workflow.
- `convert_flare.py` opens source files with `use_scripts=False`, bakes albedo with
  Cycles **CPU / 4 threads / 1 sample**, and writes 1024px textures with an 8px margin.
  Emission baking captures colour without scene illumination. A separate 8-sample CPU
  AO bake is multiplied into albedo as 0.3 + 0.7 * AO for this prototype. Select the
  intended diffuse/base-colour shader; selecting the first glossy node produced white art.
- Existing Flare UVs overlapped: the first albedo bake was nearly white despite the
  structural tests passing. The corrective rebake creates `AshvaultBake` UVs with
  `smart_project`, binds source image textures explicitly to the original UVs, calls
  `object.bake(type="EMIT", uv_layer="AshvaultBake")`, then removes original UV layers
  so the baked atlas becomes exported Unity UV0. Corrected textures were inspected
  in the final native build; overall character style remains below the requested realism.
- Preserve upstream author, license, source URL, source hash, and adaptation notes.
  Flare sources and hashes: `vendor/flare/sources.json` and adjacent credit files.
  Stone maps: `texture-sources.json` contains Poly Haven URLs, CC0 declarations and MD5s.
- Shipping attribution lives in `../Game/Assets/StreamingAssets/ART-CREDITS.txt`
  and companion licenses. Character/source-texture licenses differ; do not label
  all imported art CC0. Retain those notices when redistributing adapted assets.

## Scale and animation export

Observed failure: the initial FBX import produced Knight mesh local scale about
113.8, world scale about 12,953.6, and a renderer envelope around 268 metres.
`FBX_SCALE_ALL` removed the major unit-scale error. A later export moves the size
normalization into `global_scale`, keeping the new wrapper root at identity scale.
This is the current tested configuration, not a universal repair for every FBX:

```python
root.scale = (1, 1, 1)
root.location.z = -low
bpy.ops.export_scene.fbx(
    filepath=str(output), use_selection=True,
    object_types={"MESH", "ARMATURE", "EMPTY"},
    axis_forward="-Z", axis_up="Y",
    apply_scale_options="FBX_SCALE_ALL", global_scale=normalization,
    add_leaf_bones=False, bake_space_transform=False,
    bake_anim=True, bake_anim_use_all_actions=False,
    bake_anim_use_nla_strips=False, bake_anim_simplify_factor=0,
    path_mode="STRIP",
)
```

Blender distinguishes file-level FBX scaling from scaling each object transform.
Its experimental `bake_space_transform` is documented as problematic for armatures
and animations; leave it off. Applying transforms to an already animated armature
does not also update its animation curves and constraints. [Exporter API](https://docs.blender.org/api/main/bpy.ops.export_scene.html),
[armature transform warning](https://docs.blender.org/manual/en/3.3/scene_layout/object/editing/apply.html).

For a new source, measure evaluated, posed mesh vertices at the selected stance
frame when calculating height; original object bounds may differ from exported
posed geometry. The current converter still uses object bounds for normalization,
so Unity geometry checks remain necessary. Keep body height separate from raised
weapons. Do not add compensating scale at several hierarchy levels.

Record source timeline markers before conversion (`import-data.json`). Verify the
actual take start and marker offsets when defining Idle, Run and Attack clips;
`GothicImport.cs` currently uses offsets specific to these Flare sources. New sources
must not inherit these offsets blindly. Test the transitions, not just clip names.

## Unity import and verification

`Game/Assets/Editor/GothicImport.cs` creates explicit Standard material assets under
`Resources/Gothic/Materials`, remaps FBX material names, assigns baked albedo, and
marks normal maps correctly. Blender procedural shader graphs are not Unity shaders.
Explicit material references also prevent the earlier standalone `Shader.Find`
stripping failure. Check missing/pink textures in the built app, not just the Editor.

Renderer bounds are a conservative animation/culling envelope. A 3.525m renderer
bound did not establish that the Knight's body was that tall. For actual pose size,
sample the clip, call `SkinnedMeshRenderer.BakeMesh(mesh, false)`, and transform its
vertices to world space once. Inspect multiple poses for deformation/NaNs; retain
meaningful height limits rather than widening a failing assertion. [Unity bounds](https://docs.unity3d.com/6000.0/Documentation/Manual/class-SkinnedMeshRenderer.html),
[BakeMesh](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/SkinnedMeshRenderer.BakeMesh.html),
[model units/import settings](https://docs.unity3d.com/6000.0/Documentation/Manual/FBXImporter-Model.html).

## Reproduction and acceptance

Run from the Ashvault repository root; conversion replaces generated character assets:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python art/convert_flare.py
~/.unity/bin/unity command eval --project-path "$PWD/Game" --caller plugin --skill unity-cli 'Ashvault.Editor.GothicImport.Setup();'
python3 scripts/verify.py
```

Wait for imports and compilation to finish before tests/builds. Build the Mac app
using the repository's Unity build workflow, then run `python3 scripts/smoke_mac.py`.
This smoke checks actual player startup; it does not establish visual quality.
Open the rebuilt native app and visibly exercise movement, attacks, dodge, enemy
animation, room traversal and restart. Record screenshots and the build identity.

Final corrective UV/AO bake and palette version passed **7/7 real Unity PlayMode
tests**. Mac build `build_6092935520d4` succeeded with zero errors, and the actual
standalone startup smoke passed. Native visual review confirmed rendered baked
textures, movement/dodge, shockwave cooldown, enemy approach/death and restart.
The art remains stylized, below the owner's Witcher reference; test success is not
art-direction acceptance. Old source reflection-image warnings remain in Blender
logs; the shipped Unity assets use baked PNGs, not those source shader graphs.
