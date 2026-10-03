# Human Vagrant — first detail pass

2026-10-03. Local review candidate; art acceptance remains held.

Separate authoring branch inside this folder. Original pilot source/output/review
remain unchanged; rollback-runtime includes its prefab, material and meta files.
Original knight remains available. No equipment statistics or inventory added.

Changes: static closed machete grip, blade bevel, fitted knee repair, garment
collar/zipper/pocket seams and stitches, boot welt/laces, pouch fastener and gear
closures. Eight separately equipped meshes share the original19bone skeleton.
Explicit albedo/normal atlases; body/jacket/trousers2K, other atlases1K. Optional
vest/backpack remain disabled at start. Existing original animation clips used.

Review found misplaced eye/brow patches; these were removed. Disabling normal
maps did not cure grip pinch cracks: these are geometry defects. A constrained
4mm smoothing trial worsened the cracks and was rejected; diagnostic-smoothed.blend
is NOT the runtime candidate. Hand pads/thumb, hairline and some collar/zipper
motion still need dedicated anatomy/cloth sculpting. Procedural wear remains basic.
Do not label this AAA or production accepted.

Cloud-receipt.json pins the final export/checkpoint and output revision. Job history
includes failed dispatch, rejected vest weight fit and successful saved-checkpoint
repairs; all use CPU only. output/validation.json checks unchanged rest/actions and
sampled deformation. Runtime FBX hash must match that receipt.

review/front/side/back/run/attack and equipped variants are actual imported Unity
poses. review/london/ contains staged poses at the saved runtime camera/scale,
not live input proof. Native captures and acceptance.json record packaged review
and exact gate scope. A held World keyboard regression must be reported separately
from passing character regressions; never reuse the frozen pilot26/26 count.
