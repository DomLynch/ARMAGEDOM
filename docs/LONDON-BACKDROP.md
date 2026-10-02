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
Saved zoom1.5, characterScale1.15, followSeconds0.45, fillIntensity0.55 and keyIntensity1.2.
Zoom/pan use a bounded crop of the original calibrated projection, so image, depth
masks and 3D actors stay registered while the physical camera remains fixed.
Visual scale changes refresh foot-solver proportions; gameplay capsules stay unchanged.
