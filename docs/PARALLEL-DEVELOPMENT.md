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
