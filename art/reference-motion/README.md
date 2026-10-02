# CC0 motion reference — 2026-10-02

Targeted offline integration: Mesh2Motion's authored human motion pack is available
to Blender for retargeting. No desktop application, Unity package, service, model,
or runtime dependency was installed. The Warden remains our original mesh/rig.

- File: `mesh2motion-human-base.glb`, 5,656,648 bytes.
- Source: [Mesh2Motion pinned source](https://github.com/Mesh2Motion/mesh2motion-app/blob/79f3f61a9852ef70234a5a4a7c13ed87f7a71833/static/animations/human-base-animations.glb).
- SHA-256: `406eb0a8dc4ab366e623b79b6e3005a4951392e1bda78ae39c1099d31147733c`.
- Animation/rig assets are CC0; app code is MIT. See local `LICENSE-CC0.txt`,
  `upstream-README.md`, and [asset repository](https://github.com/Mesh2Motion/mesh2motion-assets/tree/c5b0b6c821dbf2fa1dfe49590a6f431fd9f707ce).
- Original motion authors include Quaternius, distributed by Mesh2Motion.
- `source-inspection.json`: source identity, 87 clip names, node hierarchy.
- `blender-inspection.json`: Blender 5.2.1 import, rest matrices and clip samples.

## Reproduce the CPU inspection

From the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python art/reference-motion/inspect_source.py
shasum -a 256 art/reference-motion/mesh2motion-human-base.glb
```

The inspection loads the reference into a fresh, unsaved Blender scene. It writes
only `blender-inspection.json`; no game assets or original rigs are edited.

## Retarget facts

Blender import: identity armature object matrix, Z up, forward **-Y**, left limbs
on +X. Feet point from ankle Y +0.0358 toward ball Y -0.1132. Convert the whole
source basis to the target's forward basis; do not copy local Euler rotations.
Map world/rest-relative rotations, accounting for different bone rolls and the
source's three spine bones. Keep target bind poses, skin weights and proportions.

| Clip | Frames at 24 FPS | Seconds | Suitability |
|---|---:|---:|---|
| Walk | 0–40 | 1.667 | Heel/toe roll and weight transfer; restrained candidate |
| Jog | 0–28 | 1.167 | Longer strides and substantial flight/bounce; compare visually |
| Sprint | 0–20 | 0.833 | Faster running candidate, not a walking replacement |

All three have zero root translation: **in-place clips**. Walk's planted forefoot
travels about 0.326 m over one quarter cycle, implying approximately 1.304 m
forward travel per cycle at the source scale. This is an inference from measured
contact movement, not authored root-motion metadata. Re-measure after retargeting;
do not assume the previous Warden 2.375 m stride still applies.

Source thigh/calf lengths are approximately 0.4003/0.4295 m. Walk pelvis height
spans 0.8706–0.9123 m in the sampled cycle; Jog spans 0.7140–0.9360 m. Simply
accelerating Walk to 4.2 m/s risks rapid stepping. Acceptance requires side and
game-camera movement review, foot contact, turns, starts and stops on the Warden.

The first inspection used an unsupported NLA collection `.clear()` method;
removing tracks individually fixed it. The corrected same import/sample workflow
completed successfully. No add-on scripts were executed from the GLB.
