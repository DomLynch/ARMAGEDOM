# Wet, scarred roach (27 Oct 2026)

Dom's style target: `style-target.webp` (giant wet, spiky, scarred roach, amber-green underbelly, ringed antennae, Big Ben).

Look-only change to `Web/public/assets/roach/original-roach.glb`:
- New 512 px WebP atlas painted procedurally by `paint.py` (numpy + Pillow, CPU, fixed seed 2710). Same four UV bands as before:
  shell/head, abdomen lines + antennae + mandibles (ringed dark/amber), legs (segmented, scarred), eyes (glossy black).
- Material name kept ("Worn rust-brown chitin": roach-appearance.js guards on it), `roughnessFactor` 0.76 to 0.42 for the wet sheen.
- Mesh, skin, 27 joints, six clips and UVs are byte-identical: only bufferView 0 (the image) changed and the meshopt offsets shifted by the size difference.
- Size 369,440 to 254,836 bytes (atlas 164,782 to 50,166 bytes). Poly count and texture dimensions unchanged.
- Source GLB sha256 `d38016af...8922`; new `ea4e9bc1...d462` (pinned in `manifest-hollow.json`).

Run: `python3 paint.py out.glb` next to `original-roach.glb` (VPS, `/srv/dev-jobs/art-roach`). No GPU, no paid service.
Not done: added spike geometry (needs a meshopt re-encode of the mesh); the spikes come from the existing mesh plus texture.
