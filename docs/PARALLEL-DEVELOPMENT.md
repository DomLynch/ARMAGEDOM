# Three.js development lanes — 2026-10-04

Canonical root /Users/domininclynch/Desktop/Business/ARMAGEDOM holds accepted
integration. All lanes use canonical AGENTS.md, PROJECT_STATE.md and the single
shared Codex note. Worktree status is not release acceptance.

| Checkout | Owner |
| --- | --- |
| worktrees/lead | Lead integration/combat/input contract |
| worktrees/combat | Combat mechanics |
| worktrees/character-web | Characters portable rigs/weapons |
| worktrees/world-web | World registered world/audio |
| worktrees/web-ui | WebUI HUD/input |
| worktrees/deploy-web | Deploy immutable packaging/hosting |
| worktrees/backend | Backend isolated optional account/private saves |
| worktrees/auditor | Independent on-demand review |

worktrees/character and worktrees/world are historical authoring lanes. Their
portable art and dirty work remain; use current web lanes for active code. The
old engine projects/caches/tooling in all eleven checkouts are privately archived
outside the repo. Do not reintroduce them from an inherited branch or old guide.

One owner per deliverable. Hand Lead a pinned commit/base, exact paths/hashes,
validation receipts and known gaps. Integrate bounded deltas at a quiet checkpoint,
never merge the private starting baseline wholesale or overwrite other authoring.
Use small scoped commits. New live versions require explicit allowlists and exact
immutable packages; Deploy serves accepted bytes with Three.js-only rollback.

Plain ES modules; one active combat implementation, six actions. Keep originals,
saved framing and donor provenance. Heavy build/art jobs stay sequential. No
Unity commands or native jobs. Gates test Web code in the assigned checkout;
legacy art-only lanes use the canonical gate. Build/served/browser/physical-phone
receipts stay separate. Branches may contain archived historical engine commits;
never pull their Game/ or engine scripts back into the active tree.

## Merging and audit tiers — 2026-10-24 (Dom, via Strategy)

The gate is the `web-gate` GitHub check (`.github/workflows/web-gate.yml`): verify_web
in 8 shards plus the server/db tests, on every PR push and on main. It is required on
main. The VPS is the source mirror, not the gate box.

Lead labels every PR with a tier when it opens:
- `tier-a`: copy, HUD text, assets, textures, docs, and data-only rows with no sim
  effect. Merges as soon as `web-gate` is green (auto-merge), with no Auditor. Stills
  are needed only when the picture changes.
- `tier-b`: sim, combat, backend, save, multiplayer, and anything in a hit or damage
  path. Needs an Auditor PASS at the head as before: the Auditor posts the PASS and
  adds the `auditor-pass` label. Lead enables auto-merge when it sends the PR to the
  Auditor, so a PASS plus green CI merges without a wait.

The `audit-gate` check (`.github/workflows/audit-gate.yml`) enforces this. It fails
without a tier label. A tier-b PR passes only with `auditor-pass` AND when the newest
"**Auditor: PASS|FAIL at <sha>" comment is a PASS naming the current head. Any new
push removes `auditor-pass`, so a PASS always binds to the head it was given on.

The Auditor may move a PR up to `tier-b` with one line on the PR. A tier-A PR is cut
from main and merges on its own; stack a PR on another only when its code depends on
it. A green, approved PR still waiting after 5 minutes is a defect. Tests assert
structure (element present, length cap, key present), not exact sentences.
