# ARMAGEDOM — current source state

Updated 21 October 2026 for the combined navigation202 and audit-remediation candidate.

- Active client: `Web/`, Three.js ES modules. Unity remains retired.
- Audit base: release 201, commit `f06c17ecf75d5f250bb94d4f60f10f82ea70d60f`.
- This branch repairs audit findings and tests. It is not a publication receipt.
- Navigation202 includes four marked side entrances, selected-route atlas and the
  original Westminster shelter tutorial. Audit remediation c4ded46 is integrated
  through sole Web; combined validation and Lead/Deploy acceptance are pending.
- Current release/owner coordination: the canonical Codex handover at
  `Vibe Coding Management/codex-state/armagedom.md` in the Business workspace.
  Verify served identity before making a live claim.
- Source gate: `node scripts/verify_web.mjs`; packaging/build in `Web/package.json`.
  Heavy checks run remotely under the workspace compute policy. Browser and
  physical-phone acceptance are separate from automated source/build checks.
- Findings and validation: [audit remediation](docs/AUDIT-REMEDIATION-20261021.md).
- Previous state and all historical receipts are preserved in
  [the unchanged historical state](docs/history/PROJECT_STATE-pre-audit-20261021.md).

Preserve dirty authoring work, donor originals, save compatibility and rollback.
Lead owns integration; Deploy owns immutable publication. Actions and source-sync
holds remain deliberate until their owners explicitly change them.
