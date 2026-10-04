# Team and Frankendom reuse — owner approved 2026-10-04

> Active platform: [Three.js only and Unity retirement](THREEJS-ONLY-RETIREMENT.md),
> owner decision 2026-10-04. Unity/native instructions and public-retention rules
> in older records are historical; private recovery archives are not live rollback.

Next owner-directed content slice: [Hollow common-enemy pilot](HOLLOW-MOB-PILOT.md).
Characters & Art owns one reused human-body candidate; Lead coordinates Combat
and a small existing-area group encounter. This is a bounded new mob approval,
not the full future roster or five-area expansion.

Planning addition 2026-10-04: [Westminster Zone 1](WESTMINSTER-ZONE-1.md) is the
consolidated story/map/enemy/AI beta direction, capped by Dom at **eight areas total
(three existing plus five additions)**. Executioner/Centurion/WARDEN and the full
enemy roster are staged design targets, not a new batch implementation assignment.
Preserve current three-area work and owner-selected006 framing/stamina008 work.
Stamina was explicitly requested after the original pilot; the no-automatic-stamina
clause below does not reverse that subsequent approval.

Dom explicitly approved starting the bounded maintenance/reuse work and mirroring
Frankendom's developer sessions under ARMAGEDOM, including Auditor, Web/UI and
backend/Supabase ownership. This supersedes previous assessment-only, no-new-dev
and blanket no-backend instructions to the extent below. Keep the existing
Three.js foundation; no restart from zero. Lead coordinates all lanes.

## Nine lanes, clear ownership

| Lane | Existing/new | First deliverable |
| --- | --- | --- |
| Lead Dev | existing | Scoped versioned Web baseline, dedicated web gate, minimal file contracts, integrate one reuse pilot |
| Strategy | existing | Scope, acceptance, priorities and Lead oversight |
| Characters & Art | existing Main Char | Pinned Frankendom player plus one distinct opponent, rig/grip/gear/motion and export provenance |
| Combat & Specials | new | Adapt one donor melee weapon and matching animation/contact/guard/dodge behaviour to a roaming London fight |
| World & Audio | existing Visuals & World | Preserve registered London world/occlusion; existing area travel and integrated world/audio responsibilities |
| Web & UI | new | Responsive portrait/landscape HUD/input, reachability, menu and input-cancel proof; adapt useful donor helpers |
| Backend & Persistence | new | Minimal account/save contract, Supabase discovery, isolated development schema/RLS and two-user isolation proof |
| Auditor | new | Independent foundation and integration review with concrete severity/evidence; no implementation or duplicate monitor |
| Deploy | existing | Reproducible exact-version packaging, current preview rollback and existing host publication |

Lead owns file-boundary decisions and integration schedule. New sessions initially
inspect and prepare bounded findings/contracts; no new lane edits Lead's working
files while the uncommitted Web baseline is being secured. Lead establishes a
scoped baseline preserving unrelated local work, then provides a confirmed base
and isolated checkout/branch to each active implementation lane. Existing visible
world/character lanes remain; no reset/clean or wholesale private baseline merge.
Do not create additional task/subagent trees or recurring monitors from onboarding.

## Immediate sequence

1. Preserve responsive002 and exact source snapshot; create a scoped versioned Web
   baseline and web-only checks that cannot launch Unity. Readable formatting is
   behaviour-preserving, not a generic architecture rewrite. Lead owns main.js,
   package/lock, integration and baseline; Deploy owns packaging scripts. Auditor
   reviews source/version/gate/asset selection boundaries independently.
2. Borrow from a PINNED donor revision/assets. Candidate first pair: existing
   Frankendom player and Goblin body as a mutant; if actual rig/weapon compatibility
   makes another existing opponent cheaper, Lead selects and records why. Start
   with ONE matched melee weapon. Character and Combat preserve donor rig, attack
   trajectory, animation timing, impact response and sound as one coherent bundle.
   Adapt duel/ring/two-fighter assumptions for movement, obstacles and multiple
   enemies. Keep six ARMAGEDOM inputs; no automatic extra kick/stamina/progression
   feature scope merely because donor has it. Preserve002 comparator/rollback.
3. Show one full London fight with the borrowed body/weapon and proper touch+desktop
   behaviour. Dom evaluates combat feel. Only after this works adapt a small human,
   fast-mutant and bruiser cast using existing content roles. Do not import100ranks,
   ten player classes or all donor assets at startup. Modern outfits are separate
   derivative meshes/materials; original art untouched. No generator job if a
   suitable authored body already exists.
4. Backend runs independently on a SMALL foundation: identify existing authorised
   ARMAGEDOM development resources; define auth/profile and versioned character-save
   contract, migration and access-control tests. Local/dev implementation may proceed
   once isolated. Do not silently reuse Frankendom's production database, users,
   storage or service keys. If no ARMAGEDOM environment exists, report the concrete
   deployment choice/cost to Lead; schema/code can be prepared without buying a plan
   or applying to production. An auth/save database is not MMO combat authority.
   Never accept arbitrary client currency/loot/progression as authoritative rewards;
   represent unvalidated prototype saves explicitly until server validation exists.

Supabase-specific work must follow the Supabase skill and current official docs:
server secrets stay server-side, exposed tables require appropriate RLS, and tests
must prove userA cannot read/write userB. Handle save revision conflicts and migration
rollback. Keep login optional for the existing playable preview unless owner decides
otherwise. One schema/SDK boundary, not a generic service framework. Future realtime
world simulation/interest management/PvP/sharding/economy are design constraints,
not implementation milestones now. No duels lane or copied Frankendom rollback netcode.

## Donor isolation and validation

Frankendom remains read-only; this does not resume its paused development/release
or authorise its deploys. Record donor Git revision, file/asset hashes and applicable
asset provenance. Copy a focused snapshot into ARMAGEDOM or adapt modules; no runtime
cross-repo symlinks, shared production state, automatic upstream sync, or shared
library extraction project. Replace overlapping ARMAGEDOM melee behaviour through
one integration point rather than shipping two active combat engines.

Use phone-sized browser checks during development, then physical iPhone Safari /
Android Chrome and keyboard/mouse evidence: all six actions, movement+aim+attack,
held guard/parry, menu/rotation/background safety, collision/occlusion, weapon grip,
death/retry and full encounter. Measure cold/warm transferred bytes, decode/time-to-
playable and representative frame pacing. Distinguish source, tests, local build,
served preview and owner/device acceptance. No claim that an imported asset or passing
unit tests proves matched combat feel. Keep scope in three existing starting areas.

## Coordination and compute

Lead is the sole peer-coordination owner, using its existing monitor; Strategy checks
Lead every10minutes. Auditor is on-demand at milestones, not another polling lane.
Do not send routine report-back/ack loops. Share actionable blockers and completed
pinned artifacts. Heavy jobs are sequential on Mac; suitable HF/Blender jobs may use
verified approved32GB CPU/$0.03h with bounded runtime, saved outputs, stopped workers;
no expensive GPUs/new paid services. Backend infrastructure charges require a concrete
owner-approved choice. Keep original portable assets and reviewed Three.js rollback. Retire active/public
Unity through the verified private archive; do not preserve native public downloads.

## Registered chats — all host local

| Title | Thread ID |
| --- | --- |
| ARMAGEDOM - Auditor | `01a104bb-bbd8-7001-8561-b8ea115e1c43` |
| ARMAGEDOM - Characters & Art | `01a10055-1cb6-7b51-8107-ba9099ac751b` |
| ARMAGEDOM - Combat & Specials | `01a104bb-b4dd-7c50-9a6e-a0d421364a5e` |
| ARMAGEDOM - Deploy | `01a1007c-7191-71b0-abcf-3c064cf285fa` |
| ARMAGEDOM - Backend & Persistence | `01a104bb-b839-7ae1-8530-a6424c816fbc` |
| ARMAGEDOM - Lead Dev | `01a0fdd9-c198-7f60-b86d-7d407806d3d2` |
| ARMAGEDOM - Strategy | `01a0ff86-c6a2-76f2-b766-a2c5fc3c5ff6` |
| ARMAGEDOM - Web & UI | `01a104bb-b68a-7ea2-aa94-8242bc09f1c1` |
| ARMAGEDOM - World & Audio | `01a10076-a384-7663-aac1-66f36c4cce51` |
