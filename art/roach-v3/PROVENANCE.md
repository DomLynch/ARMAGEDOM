# Roach v3: plated, spiked, wet (27 Oct 2026)

Style target: `style-target.webp` (Dom's giant wet, spiky, scarred roach; Big Ben). Replaces the v2 look (PR 375, kept open as the fallback).

Pipeline, all CPU (VPS, no GPU, no paid service): `run3.sh` runs `atlas3.py` (Pillow/numpy), `build3.py` (Blender 5.2 headless), `gltf-transform meshopt`, then `anim_cmp.py`.
- Rig kept: the original `ARM_RoachRig` armature, all 27 joints and names, six clips (`roach_bite/death/hit/idle/run/walk`), single skinned mesh `ARM Original Infected Ground Roach`, single material `Worn rust-brown chitin` (roach-appearance.js guards on both names).
- Mesh: legs, antennae, mandibles, cerci, head and underbody are the original geometry (legs inflated along their normals, eyes slightly). Removed: the abdomen ridge strips. Added: domed pronotum, two wing cases with torn rear edges, a raised torn flap, about 100 cone spikes (legs, brow, rear rim), three mandible drips. Every new vertex copies the skin weights of the nearest original vertex (no re-parenting, no new bones).
- Size: 5,966 triangles (was 5,076), GLB 525,280 bytes (was 369,440); albedo 1024 WebP, ORM 512, normal 512.
- Textures: carapace, olive underbelly, leg and head regions are crops of the reference image (`atlas3.py` boxes), mirrored and re-gritted; antenna rings and eye texel are painted. Roughness (ORM green) is derived from luminance so dark wet areas are glossy; the normal map is a Sobel of the luminance.
- UVs: new layout (shell, belly, legs, head, antennae, eyes in one 1024 atlas); legs map u by normal.z and v by distance along the leg.
- Clip timing: Blender re-export trims each clip by under one frame at 24 fps (bite 0.600 to 0.583 s, idle 1.600 to 1.583 s).
- Source GLB sha256 `d38016af...8922`; new `1d1a8eb4...bb8c` (pinned in `manifest-hollow.json`).

Tint: the area8 roach uses recipe `roach-ash`, whose old shellTint (2.4, 6, 24) turned the new brown albedo bright blue in game. Lead decided (27 Oct): the row is now 1.6, 1.15, 0.85 (appearance.json), re-pinned in `appearance-pre-data.json` and `roach-appearance-pre-data.json` (roach-ash entry only). Result: `stills/game-v3-warm-crop.png`.
Size flag: the GLB grows 156 KB (369 to 525 KB).
