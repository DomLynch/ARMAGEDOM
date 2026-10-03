# ARMAGEDOM

Canonical game and planning workspace: /Users/domininclynch/Desktop/Business/ARMAGEDOM.
Migrated from Ashvault on2026-10-03, preserving Git history and local assets/builds.

A local Unity desktop ARPG set toward2029–2030 post-nuclear London. The first area
uses the owner's Westminster image with animated3D actors, hidden collision/depth
masks,1.65x zoom,26.5% larger characters and gentle scrolling. The original fantasy
roster remains pending the human vagrant/art conversion. No backend or multiplayer.

## Open and play
- Unity6000.3.25f1 project: Game/; scene Assets/Scenes/Ashvault.unity.
- Existing native Mac build: Builds/Ashvault.app. Legacy internal names remain.
- WASD move; left click slash; Q/right click heavy; Space dodge;1 shockwave.
- R restart; V paused character inspection, then V to return.
- Saved tuning: Game/Assets/StreamingAssets/London/layout.json. See
  [London content/reload contract](docs/LONDON-BACKDROP.md).

## Where things live
- Game/ — Unity source, assets and saved content.
- Builds/ — local playable builds; art/ — original sources and provenance.
- briefs/, sessions/, handovers/, references/ — project planning and records.
- scripts/, ops/ — verification and guarded source-sync tooling.

Start with [current status](PROJECT_STATE.md), [strategy brief](briefs/MAIN-STRATEGY-DEV.md),
[developer handover](docs/ARMAGEDOM-HANDOVER.md), and [source sync](docs/SYNC.md).
The [original narrative](docs/ARMAGEDOM-WORLD-BRIEF-SOURCE.md) remains unchanged.

## Verify
From this repository, run python3 scripts/test_sync.py, python3 scripts/verify.py,
and python3 scripts/smoke_mac.py as declared in .quality-gate.json.
Gameplay source remains small and platform-neutral. Reuse Visual children without
changing gameplay capsules. Art/rig provenance: art/hero/README.md and art/enemies/roster.md.
