# Ashvault — 2026-10-02

## Objective
One local isometric ARPG run: move, fight, dodge, collect upgrades, beat a boss,
die/restart. Target 5–10 minutes, 3 normal enemy types, 4 connected chambers.

## Decisions
- New local Git repository, no remote/deployment target.
- Unity 6000.3.25f1 Apple Silicon LTS installed; Personal license activated.
- Built-in 3D rendering and native primitives; no art-generation dependency.
- Gameplay owns root transforms/colliders; `Visual` child owns appearance.
- Alternatives: imported art-first slows the experiment; full controller packages
  add dependencies; native small components selected.
- Scope: only this repository plus its Codex handover; do not inspect/change Frankendom.

## Verification
- CLI 1.0.0-beta.12 installed; account sign-in verified.
- Game project created with official Built-in 3D template and Pipeline package.
- First batch compile + scene setup succeeded (`artifacts/setup.log`: ASHVAULT_SETUP_PASS).
- Eight runtime scripts implement combat, four chambers, three enemies, boss,
  nine pickup variants, and restart: 775 runtime lines, 982 total C# lines including setup/tests.
- User completed Editor terms. TMP resources imported; UI uses Canvas/TMP.
- Six real Play Mode tests passed (`artifacts/playmode-results.json`). Covers attack
  range/facing/cooldown/walls, dodge/invulnerability/expiry, death/restart,
  telegraph timing under stagger, loot, full chamber/boss progression, shader assets,
  and the entrance waiting safely until the player moves or attacks.
- Simulated W input passed. Simulated Space missed the event; actual native Space
  input passed without gameplay changes. See `artifacts/input-review.md`.
- First standalone build failed: Standard shader stripped, causing ArenaBuilder.Start
  to fail. Fixed by explicit Resources material assets; subsequent actual Mac player
  headless smoke passed (`artifacts/player-smoke.json`).
- Required gates: `python3 scripts/verify.py` and `python3 scripts/smoke_mac.py`.
- Packages trimmed to Input System, uGUI/TMP, test framework and Pipeline plus Unity modules.
- Pipeline is intentionally disabled in the standalone app. Its build warning is expected.
- Local-only project: no remote, CI, deployment service, telemetry/backend, or paid compute.

## Final desktop proof / remaining validation
- Universal Mac `.app` built successfully, zero build errors; actual headless startup
  check passed after the final rebuild. Visible standalone arena/HUD reviewed.
- Native standalone keyboard checks: 1 displayed its 6.7-second cooldown; Space
  moved the player and displayed its 0.3-second remaining cooldown; R reset to 100 HP.
- Demo is ready for the user's first playtest; entrance stays safe until input.
- Human game-feel, difficulty and 5–10 minute run length need user playtesting.
- Windows source compatibility is intended; a Windows build has not been run.
- Placeholder actors have separable visuals, not skeletal animation rigs.
