# ARMAGEDOM — development handover

Updated2026-10-03. Canonical workspace:
/Users/domininclynch/Desktop/Business/ARMAGEDOM.
The complete Ashvault checkout moved here; GitHub remains DomLynch/ARMAGEDOM and
the VPS source follower remains /opt/armagedom. No second checkout or old-path
compatibility symlink is required. Briefs and sessions are now in this repository.

Read AGENTS.md, PROJECT_STATE.md and briefs/MAIN-STRATEGY-DEV.md first.
PROJECT_STATE.md is the current technical status source; older build/log paths
inside artifacts are historical receipts, not current launch instructions.

## Game and content
Unity6000.3.25f1 Built-in, Game/Assets/Scenes/Ashvault.unity, Builds/Ashvault.app.
Internal scene/assembly/app names remain for compatibility; folder migration does
not require rebuilding or renaming them. WASD, slash/heavy, dodge, shockwave,
pickups and three waves remain. Current roster is Warden/Revenant/Orc/Warlock;
the human vagrant replacement is pending the intended reference/model.

The current London area is a2.5D image stage: original Westminster artwork,3D
actors, invisible floor/road boundaries and authored depth masks. The previous
3D London prefab remains preserved. Saved zoom1.5, characterScale1.15, gentle
edge-clamped follow and character fill lighting are installed and user-tried.
Runtime edits use Game/Assets/StreamingAssets/London/layout.json and backdrop.png.
See docs/LONDON-BACKDROP.md for validation, reload and image/perspective limits.
Painted buildings are not independent movable3D props. New behaviors need code;
new content delivery/public multiplayer infrastructure is not implemented.

## Direction and constraints
Working title ARMAGEDOM; grounded post-nuclear London, gameplay2029–2030 per direct
owner request. The original narrative's2045 date remains preserved unchanged in
ARMAGEDOM-WORLD-BRIEF-SOURCE.md; clarify chronology before writing dated quests.
Keep existing controls and reusable character rigs/bodies while moving toward
human survivors, raiders and mutants with scavenged contemporary equipment.
No backend/MMO or expanded campaign merely because long-term plans mention it.
Preserve original images, rigs, materials, animations, licenses and provenance.
Hugging Face CPU preferred; local Metal allowed; no paid cloud GPU or purchases.

## Implementation and verification
Relevant runtime files: RunManager, LondonBackdrop, HeroView, ArenaBuilder,
PlayerController, EnemyController, ArtMotion, Health, CombatEffect, LootPickup,
SimpleHUD. Use actual new repository root for CodeGraph/Semble; preserved Library
backups can pollute discovery. Source inspection and executable checks are decisive.

Run every command in .quality-gate.json from this root. Prefer Unity CLI with the
explicit new Game/ path and caller/skill tags. Persistent Editor must be stopped
before relocation. Do not routinely clear Library or rebuild for documentation.
Mac smoke checks the real packaged startup; native visual checks are separate.
Keep deformed-foot/skate/weapon ground checks unchanged when modifying actor size.
Only verified scoped changes are committed/pushed; preserve unrelated settings,
untracked original art, duplicate backups and local builds. VPS is source-only.
See docs/SYNC.md. Never reset a dirty/diverged follower to force parity.

Codex handover: ../Vibe Coding Management/codex-state/armagedom.md.
The retired ashvault.md file only redirects here. No Claude records are edited.
