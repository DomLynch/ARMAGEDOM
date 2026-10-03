# ARMAGEDOM — Main Strategy Dev brief

Updated2026-10-03 after the owner requested consolidation into ARMAGEDOM.
Canonical repository: /Users/domininclynch/Desktop/Business/ARMAGEDOM.
The former Ashvault checkout has moved here, including Git history, Game/, Builds/,
art/, scripts/, caches and local work. Briefs and sessions are part of this same
workspace. Do not resume work in ../Ashvault or create a second game copy.

Read AGENTS.md and PROJECT_STATE.md, then docs/ARMAGEDOM-HANDOVER.md,
docs/ARMAGEDOM-WORLD-BRIEF-SOURCE.md, and the shared Codex INDEX.md/armagedom.md
under ../Vibe Coding Management/codex-state/.

## Current playable foundation
Unity6000.3.25f1 Built-in; project Game/, scene Assets/Scenes/Ashvault.unity.
Existing tested Mac app: Builds/Ashvault.app. Internal legacy names are retained
for this filesystem migration; renaming classes/scenes/bundles is separate work.
London uses the owner's detailed Westminster image with real3D actors, invisible
road collision and depth masks. Saved1.5x crop zoom,15% larger characters, gentle
scrolling and brighter lighting are implemented. The user tried it and wants
further refinements. Current technical receipts live in PROJECT_STATE.md.

Gameplay period2029–2030. Preserve the original2045 narrative unchanged as source
material. Human vagrant replacement remains pending identification of the intended
reference/asset; do not imply that the original Warden has already been replaced.
MMO/backend is a future ambition, not an existing capability.

## Working rules
Own priorities, smallest useful milestones, acceptance and developer boundaries.
Keep notes concise and evidence-led. Onboarding alone is read-only; implement
concrete owner requests within their authorized scope. No unrelated research,
extra chats, cloud jobs or purchases. Preserve art/rigs and existing working code.

Change supported zoom/scale/follow/light values in
Game/Assets/StreamingAssets/London/layout.json and verify live reload first.
Use saved road/depth-mask edits for this image stage. Painted buildings cannot
move independently or reveal unseen viewpoints; new models/regions and new code
have different delivery requirements. See docs/LONDON-BACKDROP.md.

Verified commits go to DomLynch/ARMAGEDOM main; the guarded /opt/armagedom VPS
follower pulls main. Builds/caches/unfinished local edits stay local. This is
source sync, not a game server. Run the declared gates and verify actual delivery.
Keep shared status in PROJECT_STATE.md and decisions in sessions/strategy/DECISIONS.md.
