# ARMAGEDOM — current source state

Updated 21 October 2026 for the Westminster shortcut closure203 candidate.

- Active client: `Web/`, Three.js ES modules. Unity remains retired.
- Candidate base: accepted LIVE202, commit `6dee43e93b9785cbe5d5cc734ae7a6d33f2c7ff6`.
- Removes Westminster ↔ Central Hub links and associated guidance/atlas connection.
  Keeps nine areas, 28 directed links, three other Hub entrances, existing gates,
  saves and the six original Westminster Shelter tutorial waypoints.
- Candidate validation and Lead/Deploy acceptance are pending; this file is not a
  publication receipt. Parked performance WIP is excluded.
- Current release/owner coordination: the canonical Codex handover at
  `Vibe Coding Management/codex-state/armagedom.md` in the Business workspace.
  Verify served identity before making a live claim.
- Source gate: `node scripts/verify_web.mjs`; packaging/build in `Web/package.json`.
  Heavy checks run remotely under the workspace compute policy. Browser and
  physical-phone acceptance are separate from automated source/build checks.
- Scope and restore behavior: [shortcut closure203](docs/WESTMINSTER-SIMPLIFICATION203.md).
- Prior audit: [audit remediation](docs/AUDIT-REMEDIATION-20261021.md).
- Previous state and all historical receipts are preserved in
  [the unchanged historical state](docs/history/PROJECT_STATE-pre-audit-20261021.md).

Preserve dirty authoring work, donor originals, save compatibility and rollback.
Lead owns integration; Deploy owns immutable publication. Actions and source-sync
holds remain deliberate until their owners explicitly change them.
