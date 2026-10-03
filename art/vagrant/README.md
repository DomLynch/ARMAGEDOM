# ARMAGEDOM Human Vagrant pilot

Owner direction: post-nuclear London2029–2030; low starting rank. Worn olive
work jacket/slate centre panel, patched charcoal trousers, brown work boots,
belt pouch and short machete. Separate body, jacket, legs, boots, protection
vest, backpack, blade and handle. Vest/backpack start disabled. No inventory
system or new stats implemented; future loot can call VagrantGear or replace
matching skinned pieces on the retained skeleton.

## Reproduce

Inputs/manifest.json locks the saved current Warden motion scene and CC0 MPFB2
human anatomy. Runtime Warden.fbx matches the preserved sprint export:
89ebfb63744afd99c9255b325ef6c465c9276c5669b14b5da285fe0ff64978f7.
Donor is saved original anatomy, not a rejected Frankendom fitting. Full licence
is inputs/CC0-LICENSE.md. Original Hero/Enemies assets remain untouched.

build_pilot.py authors only a separate candidate. HF cloud_job.py uses Python3.13,
bpy5.2.2, CPU Cycles,8threads, cpu-upgrade8vCPU/32GB and20m timeout. Verified rate
$0.0005/minute; maximum hardware cost$0.01/job, not an actual billing receipt.
No GPU calls. The existing write-capable credential is passed as an encrypted
HF job secret, never recorded. Private dataset:
Domlynch/armagedom-vagrant-pilot-20261003. Jobs prove upload/download permission
before authoring and persist the model before validation. Individual receipts
pin source/output revisions; failed attempts remain available in the dataset.

After downloading final output, copy FBX/albedos to Resources/Vagrant, refresh
Unity, then call Ashvault.Editor.VagrantImport.Setup(). It explicitly maps
Standard materials, enables mesh reads for ArtMotion sole contact, reuses the
exact original Idle/Run/Attack clip assets, and writes Player.prefab. Repeated
imports are supported. Keep Unity operations sequential with other lanes.

Commands: python3 scripts/test_sync.py; python3 scripts/verify.py; Unity CLI Mac
build; python3 scripts/smoke_mac.py. capture_unity.py saves10 actual imported
baked-pose views. capture_london.py saves staged poses through the live London
scene/camera at saved scale1.265; those stills complement real native input tests.
check_volume.py is a light, read-only Blender geometry check without rendering.

## Lessons retained

- Matching a rig is not enough. Independent donor-bone transforms folded the
  shoulder surface around knight clavicle pivots. Stop that approach; use a
  continuous spatial surface fit without changing target bones or clips.
- Skeleton centres are nearly planar. Explicit forward/back cage anchors are
  needed to preserve anatomical depth. Head width/depth checks catch collapse.
- Restrict garment waist ease to the torso; applying it to sleeves shifts them
  away from arms. Use outward normals, not a fixed centre-line sign, after fitting.
- Keep a continuous covered human base beneath clothing; retain original donor
  separately. This closes cuffs and supports later garment replacement.
- Attach eye details to the fitted surface. Fixed eye coordinates can float
  after fitting. Connect blade geometry to the actual handle/grip before review.
- BakeMesh poses are needed for immediate CLI camera renders; moving bones alone
  can leave a stale skinned render. Original clip references are preserved.
- Inspect front, back, side and equipped motion before native review. Matrices and
  edge expansion cannot detect every intersection, collapsed surface or ugly fit.
- Duplicate TypeDb-All 2.json files in both BuildPlayerData/Editor and Player
  contained retired Ashvault paths. Preserving those duplicated caches outside
  Library resolved25then16build errors without wiping Library or restarting Unity.
  Backups remain in review/; no sources were removed.

## Current receipt and limits

Final export: FBX SHA256 c5767fcfc1225b6622b115569db56674ac976120965e0a75df66a6ab90c5087d;
HF job6ac0ad6bfbc85ba682378659, output revision6fd96e05afe6282412adf35afe4f13061cf4e1c8.
Eight meshes,33228 triangles. Runtime FBX hash matches cloud export. Rig/action
validation preserves19bones across17samples; head-volume check passes.

Final26/26 PlayMode and6/6 sync pass, including all shared bones/rest hierarchy,
original clips, deformation, blade floor clearance and equipment toggles.
Build_58b2a8b41f4b succeeded with zero errors and one expected Pipeline warning;
actual standalone startup smoke passes. review/acceptance.json binds model/build/
assembly/camera evidence. Ten isolated imported views and12 staged London views
review the final model; scale1.265, FOV42, camera(0,23,-26) retained.
Native UI movement/dodge/attacks were exercised; native-final-attacks.png shows
alive Wave1 combat (hostiles4,HP56,shockwave cooldown). The app is left at safe
Wave0 entrance,100HP. Brief input review is not a completed-wave or phone gate.

Known polish: face/hair, hand grip/fingers, fabric seams/wear, boot shape, pouch/
backpack detail, stronger vest-front coverage. Existing inspection can be occluded
by nearby enemies; reset first. Original knight/enemies untouched. Sources/assets
remain uncommitted for owner review; no remote survivor build published. Cloud
jobs are terminal; no GPU was used. Unity slot released after this checkpoint.

This is a pilot for design review. Face/hair, fabric wear and equipment detailing
are deliberately simple; no final AAA art, physical-phone or full loot-system claim.
