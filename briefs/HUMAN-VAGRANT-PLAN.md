# Human Vagrant pilot implementation plan

**Goal:** One modular civilian survivor visibly working in the existing London game.
**Spec:** HUMAN-VAGRANT-DESIGN.md; owner approved starting work on 2026-10-03.
**Execution:** Native in this chat; preserve canonical checkout and unrelated dirt.
**Architecture:** Retain original rig/action and gameplay root. Author separate
skinned body/clothing and attachment meshes; import a separate Vagrant model.
**Tools:** CPU Blender, bounded HF cpu-upgrade jobs, Unity CLI, existing tests.

## Constraints and review focus

Scale1.265 and camera unchanged; originals immutable; no new inventory system.
Check source bind/action identity, cloth seams during action, feet/weapon clearance,
slot replacement without animation reset, and native game-camera readability.
Cloud CPU32GB at verified$0.03/hour; each job timeout20m, ceiling$0.01/job.

## Tasks

- [x] Lock original runtime FBX, current authored-motion Blender scene, CC0 human
  donor and licences by hash. Verify cloud persistence with the actual job token.
  Files: art/vagrant/inputs/manifest.json, art/vagrant/README.md.
- [x] Author fitted human head/hands and segmented clothing, separate machete,
  optional vest/backpack in art/vagrant/build_pilot.py. Produce candidate.blend,
  Vagrant.fbx, textures and geometry/rig/action validation in art/vagrant/output/.
  Preserve current source action/bones; inspect exported pilot before promotion.
- [x] Import under Game/Assets/Resources/Vagrant/ with editor-only importer.
  Integrate visual resource selection and small equipment controls as needed;
  keep Warden fallback. Test torso/backpack changes on the same animation rig,
  movement/attack/ground-contact regressions and visual-root scale preservation.
- [x] Run configured gates, build, native smoke and visible London idle/run/attack/
  dodge checks. Save build/model-hash captures and remaining defects. Update
  PROJECT_STATE.md and shared Codex notes; keep original assets for rollback.

## Winning route

Use saved MPFB CC0 anatomy adapted to the Warden skeleton, not rejected Frankendom
fitted geometry. Clothing derives from fitted anatomy with localized construction
and wear; rigid tools authored directly. No GPU reconstruction is required.
CodeGraph attempted first but returned archived package caches; Semble identified
current HeroImport, ArtMotion and RunManager for direct reads.

## Recovery

Persist models before renders. After two unsuccessful repairs of one visible defect,
diagnose donor/fit/export/runtime stage before another attempt. Inspect diagnostic
views first; final captures must use final exports. Do not weaken existing checks.

2026-10-03: Functional pilot checkpoint complete; see art/vagrant/review/acceptance.json.
Owner art approval and listed polish remain separate from mechanical acceptance.
