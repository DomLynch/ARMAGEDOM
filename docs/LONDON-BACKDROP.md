# London image stage

Owner-approved direction, 2026-10-02: the supplied Westminster image is the visible
scene, with animated 3D actors on an invisible ground plane. A fixed perspective
camera and authored depth silhouettes preserve the image composition. The previous
Resources/London/Area prefab and art remain available as the rollback baseline.
This does not turn painted buildings into independently movable 3D assets.

Saved content lives in Game/Assets/StreamingAssets/London:
- backdrop.png is the byte-identical owner image, 1672 by 941.
- layout.json contains camera calibration, exposure, key intensity, road polygon
  and convex foreground masks. Coordinates are normalized image pixels, origin
  top-left. Each mask's foot sets its occlusion depth on the ground plane.

The Editor and a Development Mac player beside the checkout poll these source
files once per second. The player locates the checkout by walking its app's parent
directories. A copied standalone build uses its bundled StreamingAssets. No cloud
compute, account, server or generated code is involved in content reload.

Write each content file atomically (temporary file then rename). Camera/layout
changes must keep all current actors and future wave entrances within the road.
Rejected edits retain the current live scene and emit LONDON_REJECTED once per
file timestamp pair; correct/re-save the files to retry. A changed image is decoded
and validated before a paired changed layout is applied. Invalid initial content
fails startup explicitly; this is not a disk-backed rollback archive.

V temporarily hides the stage for the existing paused model inspection; returning
restores the fixed camera. Free orbit and scroll zoom are disabled during gameplay.
Camera calibration, lighting, image replacement and road/mask edits use content
reload; new shaders/mechanics still require a build. Image edits cannot reveal
unseen viewpoints or make painted objects independently movable.

Validation: expanded real Unity suite covers original gameplay, packaged reference
loading, closed road boundary, live file reload, persistence after scene restart,
invalid paired-image rejection, future spawn safety and released runtime meshes.
Native build and gameplay receipts are recorded in PROJECT_STATE.md.

## Readability tuning
Saved zoom 1.65, characterScale 1.265, followSeconds0.45, fillIntensity0.55 and keyIntensity1.2.
Zoom/pan use a bounded crop of the original calibrated projection, so image, depth
masks and 3D actors stay registered while the physical camera remains fixed.
Visual scale changes refresh foot-solver proportions; gameplay capsules stay unchanged.

Supported saved ranges: zoom 1–2, characterScale 1–1.5. The October 3 size
update raises the former 1.25 character cap in the native player. Current actor
scale is 10% above 1.15; zoom is 10% above 1.5, about 21% combined on screen.

Baked skinned geometry already includes scale: boot calibration and world-space
contact checks rotate/translate baked vertices without scaling them twice, matching
[Unity Digital Human](https://github.com/Unity-Technologies/com.unity.demoteam.digital-human/blob/master/Runtime/SkinAttachmentTarget.cs#L260).

## Connected London pilot (2026-10-03)

Launch the development Mac player with `-london-travel` for the bounded
Westminster/east/south pilot. A normal launch retains the original Westminster
rollback. The supplied original PNGs are copied byte-for-byte into
`Game/Assets/StreamingAssets/London/Travel/{west,east,south}/backdrop.png`, with
separate `layout.json` road/collision and foreground masks. No source painting
is overwritten. Camera angle, zoom1.65, actor scale1.265 and .45s crop follow remain.

Walk along the right bridge to its far edge for east; return through the east
bridge's lower-left edge. Walk down the Westminster bottom road for south;
return through the south road's upper edge. This first pilot switches images
visibly at exits; it is not a registered seamless panorama. East and south are
exploration lanes: Westminster enemies/wave updates park while away and resume
on return. The same player, health, upgrades, equipment and cooldown fields persist.
No new enemy encounter, multiplayer or 50–100-area streaming implementation is claimed.

Travel loads destination files on crossing. Original one-second saved settings
polling pauses during this opt-in pilot so it cannot overwrite the active area.
Invalid destination data keeps the prior area and actor position. R restarts the
scene and reapplies the opt-in travel loader. Current content hashes are recorded
in `artifacts/london-travel-content.json`; test/build/native evidence is separate.

South road refinement2026-10-03: the highlighted upper-left pavement and
lower-left road are now two connected spurs around the central checkpoint. The
wreck/crates remain outside the road boundary. This saved layout loads on south
re-entry; no client rebuild is needed for a development app beside this checkout.
Rollback layout: art/london/areas/south-pilot-20261003/layout-before-left-paths.json.

Follow-up: the checkpoint upper/side entrance also needs clearance for walking
from the main road into the left lane. The39point south road includes the marked
crossing(.51,.325); real keyboard testing now crosses it in both directions. The
previous branch test reached the lanes separately and missed this side entrance.

Complete south pavement loop: the road now includes the north-left pavement up
to source y.02 and the connecting lane left of the wreck. Optional `blockers`
(name/points arrays) add physical boundaries around the checkpoint and gate-side
barrel/crate. Masks retain their previous validation range. Extended road rays
must hit ground forward inside the existing200m floor; rejection retains prior
layout/camera. This change needs the new client; reopen the London launcher.
