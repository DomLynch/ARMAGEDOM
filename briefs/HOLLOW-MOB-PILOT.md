# Hollow common-enemy pilot — 2026-10-04

Dom asked for lower-detail, zombie-like human common mobs and explicitly requested
a Lead handoff, with Characters & Art as the art owner. This authorises one bounded
prototype and its encounter review; it does not start the full Westminster roster.
Read alongside WESTMINSTER-ZONE-1.md and TEAM-AND-REUSE.md.

## First deliverable

One **Hollow Scavenger**: a damaged but recognisably living human, in scavenged
contemporary clothing, with a pipe or improvised knife. Reuse the cheapest compatible
existing human body/rig and matched melee weapon/motion. Preserve donor originals,
pinned source and provenance. No new base generation if a suitable authored body
exists; no new paid jobs or Frankendom source changes.

Visual direction: gaunt/tired silhouette, hunched resting posture, uneven movement,
torn hoodie or jacket, worn trousers, grime and improvised equipment. Take the
unsettling posture/motion inspiration into the fictional Hollow population, not a
literal depiction of a real vulnerable group. They are not supernatural undead.
Not all affected survivors are hostile; this prototype represents an aggressive
scavenger. No new faction simulation or noncombatant system in this slice.

Preserve clear wind-up, contact, recovery and foot placement. Erratic idle/walking
must not hide attack tells or slide through hits. A lower visual budget means fewer
unseen details and material costs, not an intentionally ugly or unreadable asset.
Modern clothing and grip must survive actual motion, not just a posed screenshot.

## Ownership and order

1. **Lead:** assign one confirmed isolated base/path and module boundaries. Preserve
   selected006 framing, stamina008 mechanics and the existing three-area footprint.
   Audit the available suitable human donor with Characters; avoid duplicate art work.
2. **Characters & Art:** produce one separate candidate with simple fitted clothing,
   one compatible weapon and idle/walk/attack/hurt/death motion. Reuse valid clips;
   do not require a new animation library. Deliver pinned assets/manifest plus front,
   side and actual game-camera motion evidence. Review one candidate before variants.
3. **Combat & Specials:** use an existing melee behaviour for a readable common
   enemy, with its own tunable health/aggression/recovery and consistent stamina/hit
   rules. No LLM, status-effect system, new player moves or crowd-navigation framework.
4. **Lead:** integrate a group of roughly 3–5 copies in an existing Westminster
   encounter as an initial review target, subject to measured cost and readability.
   Copies can share assets; no need for several bespoke bodies or outfits first.
5. **Web/UI, World, Deploy and Auditor:** assist only where a concrete input,
   placement, publication or review task is needed. Lead owns integration/builds;
   Deploy publishes the exact approved candidate under a separate versioned URL.

## Acceptance and evidence

- Dom reviews the Hollow's identity, silhouette and movement at selected006 framing.
- Record candidate triangle count, texture dimensions, material count, asset bytes
  and provenance against the chosen donor. Do not adopt arbitrary polygon quotas
  or claim smaller downloads alone establish a faster encounter.
- Show a complete group encounter: movement, all six inputs, guard/parry, exhaustion,
  enemy attacks, readable contact, death and retry. Avoid unfair surrounds or enemies
  blocking all escape routes. Existing camera/backdrop remain registered.
- Test portrait/landscape and actual iPhone Safari/Android Chrome plus desktop;
  distinguish unavailable physical-device checks from desktop touch emulation.
  Measure representative frame pacing, loading and simultaneous move/action input.
- Keep the player/donor originals, existing single-opponent and stamina previews as
  comparators. Replace only the candidate encounter, not every existing enemy.
- After one mob and group fight are accepted, consider two cheap outfit variants
  and a contrasting Rusher role. Drones, bosses and the other five Westminster areas
  remain separate later milestones, not dependencies for this prototype.

No mass generation, 100-rank imports, new classes, paid service, production database
or world expansion. Suitable approved HF CPU work only when justified, verified at
32GB/$0.03 per hour, bounded and stopped; short ordinary work need not move remotely.

## Confirmed lane allocation — Lead 2026-10-04

Direct owner instructions were verified in Strategy's turn01a1068c-1b46-7682-acb9-57a2ecb35306.
Characters has been assigned the existing clean `worktrees/character-web`, branch
`codex/armagedom-character-web`, base21b7c4ae220124bdd7eaf06e00ae08cfb54e5f51.
Asset/export ownership is NEW `art/hollow-scavenger/**` and NEW
`Web/public/assets/hollow-scavenger/**` with a standalone pinned manifest. A needed
render-only adapter may use NEW `Web/src/hollow-motion.js` and focused new motion tests.
Existing player/donor assets, manifests and shared runtime modules are unchanged.
First checkpoint is source selection and moving front/side/selected-camera proof;
then one exported candidate with size/material/texture/provenance measurements.

Combat has been assigned `worktrees/combat`, branch `codex/armagedom-combat`,
base1e1640c9200b2eebd4f48bddb6f57cf243174a6d. Its combat.js/donor knife hashes match
current Lead5dc5610cba7cf2d0e8141b07a5d14cc7e7eac570. Combat owns a bounded optional
Hollow preset in `Web/src/combat.js`, optional small `Web/src/hollow-encounter.js`,
and new `Web/tests/hollow-combat.test.js`; keep the existing donor engine and default008.
Initial target3 independently simulated copies; final rig/body scale must follow
Characters' actual descriptor. Safe registered spawns, per-target contact, directional
defence, exhaustion, last-enemy completion and retry require source evidence.

Lead owns main/actors/loading/build/package integration once the candidate is usable.
Use actor visual multiplier1.3225, common scale1.265, camera1.3365 and scene zoom1.
No new batch, reset/rebase, source-main merge, art spend, Unity build or live promotion.
Candidate source/tests, group browser fight and physical phone acceptance are separate.
