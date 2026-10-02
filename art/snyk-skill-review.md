# Skill review and actual Codex additions —2026-10-02

Reviewed the five unique requested entries (shader link was duplicated) against
their actual files and licenses. No third-party bundle was installed unchanged.

| Entry | Verified finding | Action |
|---|---|---|
| Game Developer | [MIT source](https://github.com/Jeffallan/claude-skills/tree/882ef55e377dbf9a4dbe496bb41ac6ccd0e555cf/skills/game-developer), complete references; broad engine/networking/architecture scope | Keep existing Unity plugin; no duplicate generalist skill. |
| 3D Modeling | [Registry](https://github.com/majiayu000/claude-skill-registry/tree/51b4e968cc1df0d48e43c64e0cbd1dee59a2a060/skills/data/3d-modeling) omits required reference files. [Apache2 upstream](https://github.com/omer-metin/skills-for-antigravity/tree/e8dcf4e8737921a10088bd5c9eb65e81f74c051f/skills/3d-modeling) has them, but blanket apply-transforms and quads-only rules conflict with rig preservation. | Retain existing preservation workflow. |
| Procedural Blender | [File](https://github.com/Andrew1326/dominations/blob/26047587c0f247d3405c5099353c6497f8ceafa8/.claude/skills/blender-3d-modeling/SKILL.md) declares Apache2; repo lacks LICENSE. Examples include winding/context problems and scene deletion. | Added an original, narrowly scoped Codex skill with tested read-only geometry checker. |
| Shader Techniques | [Actual upstream license](https://github.com/pluginagentmarketplace/custom-plugin-game-developer/blob/aa7edfe267b34eac63d888f60b13e08aca7850ed/LICENSE) is custom/restricted; registry metadata marks restricted/NOASSERTION. Incorrect power-function optimization and incomplete snippets. | Excluded source. Added original pipeline-aware shader checks using official Unity docs. |
| Code Buddy Blender Automation | Linked skill path404 at [current source](https://github.com/phuetz/code-buddy/tree/70bcab004f822bccadb73f931e9de1d932b900a5); current LICENSE is Business Source License1.1. | Excluded; headless Blender already works. |

## Installed/updated locally

- `/Users/domininclynch/.codex/skills/blender-procedural-assets/SKILL.md` and
  `scripts/validate_mesh.py`: parametrized geometry workflow, scoped collections,
  bmesh context/ownership, preserved source, topology/normal/UV/export review.
- `/Users/domininclynch/.codex/skills/unity-blender-cpu-art/SKILL.md` now routes to
  `references/shader-checks.md`; its original-hero reference also contains the
  validated retargeting lessons. No copied restricted examples or global plugin changes.

Both skill validators pass. Mesh checker was executed in headless Blender5.2.1
on a valid closed cube plus a deliberately degenerate open triangle; correct
volume/boundary/degenerate results and unchanged source SHA verified. Receipt:
`artifacts/procedural-skill-validation.json`. Skill descriptions remain narrow and
discoverable; available on the next Codex turn. These are workflow additions, not
a new geometry model or a claim of automatic AAA output.

Official references: [Blender BMesh](https://docs.blender.org/api/current/bmesh.html),
[Unity Surface Shader compatibility](https://docs.unity3d.com/6000.3/Documentation/Manual/SL-SurfaceShaders.html).
Skills live outside the game's Git repo; game tests do not validate their usefulness.
Their standalone Python helper was verified with an independent geometry fixture.
