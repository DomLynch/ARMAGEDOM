> Historical engine reference only — 2026-10-04: Unity is retired; Game/ and engine commands are privately archived and must not be reactivated. Consult canonical AGENTS.md and briefs/THREEJS-ONLY-RETIREMENT.md for active Three.js work.

# Westminster checkpoint pilot

The owner supplied `westminster-owner-reference.png` on 2026-10-02 as the visual
target for an editable 3D London area, set in 2029–2030. Original bytes preserved;
SHA-256 `7ce686a7dd54b800261bb697b3e269f18cb2a72ca8ae5b7733a742ceab2c28e2`.
This first modular pilot is not a photoreal reconstruction of that image.

## Sources and authoring

`build_london.py` creates eleven original reusable mesh assets with Blender CPU.
`london-kit.blend` preserves the authoring kit; `kit-report.json` records FBX hashes
and triangle counts. Models live in `Game/Assets/Art/London/Models`.
Road and brick maps are Poly Haven CC0 sources, recorded with hashes in
`texture-sources.json`; stone/weathered maps reuse the existing project's assets.
Poly Haven license: https://polyhaven.com/license

Run from this repository with Blender5.2:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -t 4 --python art/london/build_london.py
```

Then run Unity menu `ARMAGEDOM/Import London kit`. It remaps explicit Standard
materials and creates `Assets/Resources/London/Area.prefab` only if absent.
Subsequent imports preserve the saved layout. Edit/move/reuse props in that prefab;
solid prop colliders travel with their imported meshes. Preserve each FBX's axis
conversion when rotating a placement. The central lane and outer arena boundary
retain the original gameplay footprint. Camera, roster, controls and rig assets
remain the existing prototype. Human vagrant conversion is still pending.

## Verification

`cloud-validation.json` records completed Hugging Face CPU Upgrade job
`6abffcaf404719ba37626627`:11 meshes, finite coordinates, zero degenerate triangles,
no mesh repairs required, UVs/material slots present. Input blend hash matches local.
The first Python3.12 attempt failed dependency resolution; Python3.13 completed.
Both jobs are terminal; no paid GPU was used. Geometry validation is separate
from Unity import, in-game framing and art acceptance.

`LondonTests` checks actual scene loading, flat road/upright lamps, clear central
floor, closed boundary and explicit materials. Existing gameplay/motion tests
remain. Live settings persistence and downloadable content patches are future
capabilities, not part of this saved-prefab pilot.
