# ARMAGEDOM — First playable loop

Owner direction: 2026-10-03. Lead owns allocation and integration.

## Goal and scope

Turn the existing centre/Westminster, south and east areas into one enjoyable
15–20 minute first session. These three areas are enough. Perfect a small combat
and equipment loop before multiplying content. This is a playable ARPG slice,
not an MMO launch or a claim that multiplayer exists.

Keep working content and rollback candidates; do not delete assets to reduce
scope. Freeze additional areas, classes, large enemy/item rosters, crafting,
trading, accounts, backend expansion and browser delivery for this milestone.
Missing combat, equipment and local-save behaviour below is explicitly in scope.
Reuse working systems before adding new ones.

Current baseline: three-area travel exists, but east/south are exploration areas
with Westminster combat parked while away. The new encounter/progression loop
must be implemented and verified; travel test passes do not establish it.
PROJECT_STATE.md remains the source for current build and validation receipts.

## 1. Make the small combat roster feel good

- One accepted survivor: readable silhouette, convincing movement, weapon grip
  and attack contact at the actual gameplay camera.
- Three enemy roles: basic melee, heavy melee and ranged. Reuse existing mechanics
  and assets where suitable; ranged does not imply a general firearms system.
- One baseline boss using proven combat behaviour. Enemy tells, avoidance,
  damage feedback and deaths must be readable and fair.
- Make ordinary encounters enjoyable before adding variants, outfits or classes.

Acceptance: a player can move, attack, avoid attacks, defeat a mixed encounter,
die and retry without stuck states. Show native gameplay at the saved camera and
scale. Dom accepts the character presentation and combat feel; technical tests
support that judgement but cannot replace it. Stabilise ordinary enemies before
assembling the boss encounter.

## 2. Complete one useful loot and equipment loop

- One weapon family with a few meaningful upgrades and a small armour selection.
- Defeat an enemy → collect a drop → equip it → see the equipment change → feel
  its combat benefit → save → quit/relaunch → retain it.
- Use the smallest interface and local persistence needed to prove that loop.
  No inventory grid, crafting tree, account service or MMO economy is implied.
- Fit and review one representative equipment asset before producing variants.

Acceptance: demonstrate the complete loop in one reproducible run, including
relaunch and death/retry. Verify equipment/stats agree and rewards cannot be
duplicated by ordinary retry/reload. Dom can distinguish upgrades during play.

## 3. Join the three areas into a first session

- Centre: introduce movement, combat and the immediate objective through play.
- South: a harder encounter rewards the first useful upgrade.
- East: use that upgrade against the first boss; provide a clear completion beat
  and reason to return. Reuse the baseline boss from milestone 1.
- Polish existing paths, occlusion, transitions, encounter placement, labels,
  essential HUD/audio feedback and death/retry. Do not make a fourth area.
- Keep the 2029–2030 immediate aftermath and conflicting surviving AI factions
  from MAIN-STRATEGY-DEV.md. Use atmosphere and authored dialogue for this slice;
  EDEN is not active canon. LLM tactics/memory remain a later one-boss experiment
  after this reliable baseline, outside this milestone's critical path.

Acceptance: five uncoached players can start, understand the objective, traverse
the three areas, improve equipment and finish or retry the boss. Record where
they get confused, disengage or hit defects, then fix the largest blockers.
Validate intended Mac and Windows downloads on their actual operating systems;
an unavailable platform stays explicitly unverified. Source sync, a successful
build and a working downloaded game are separate receipts.

## Allocate within the existing team

| Lane | Responsibility |
| --- | --- |
| Lead Dev | Combat, minimal equipment/save runtime, task allocation, integration and acceptance gates. Delegate bounded tasks without competing ownership. |
| Main Char | Survivor, minimal enemy and equipment visuals; animation/grip/fit at game scale. Approve a representative asset before batching. |
| Visuals & World | Finish the current south-path check, then polish these three areas and place the agreed encounters. No additional region generation. |
| Deploy & Github | Package the tested revision, retain rollback/checksums, verify download and startup on supported target systems. |
| Strategy Dev | Scope, narrative consistency, priorities and review of acceptance evidence. |

No additional permanent developer lane now. Use a fresh independent reviewer at
milestone/release checkpoints. Reconsider a specialist only for a concrete
bottleneck with separate ownership; do not staff hypothetical MMO systems.

## Execution discipline

Lead publishes a compact assignment list: owner, next concrete output, dependency
and acceptance check. Milestones are sequential gates; independent art preparation
may proceed, but only one integrated milestone is being closed at a time.
Preserve current owner-specific requests and finish bounded work already underway.

Keep one explicit local Unity build/test slot; no duplicate Editors or overlapping
heavy jobs. Prefer the existing authenticated HF CPU workflow for suitable offline
work, verifying the approved 32 GB/$0.03 per hour tier before launch, bounding
runtime, retaining outputs and stopping completed jobs. Unity remains local unless
a supported remote environment is actually established. No new purchases or GPUs.

After two failed attempts using the same approach, report the exact failing stage
and change the diagnostic approach. Verify the test/input setup before rewriting
working runtime code. Prefer a small reproducible case over repeated full builds.

Automate repeatable failures at their source: travel/collision, combat state,
equipment/stat consistency and save/reload. Use representative accepted assets
and shared settings for later scaling. Do not treat numerical art checks as proof
that motion, readability or combat feels good.

Each handoff records the changed revision/content, scoped checks, native evidence,
remaining defects and next owner action. Run the repo's applicable release gates
through the assigned lane; avoid duplicate verification jobs. No deadline or
completion claim substitutes for those receipts.

**Immediate Lead action:** allocate milestone 1 across the existing lanes, retain
the current south-path acceptance as a small closure item, and report the smallest
combat demo to review next. Do not open additional content or infrastructure lanes.

## Lead allocation — milestone 1, 2026-10-03

### Frankendom combat lessons — Strategy recommendation, 2026-10-03

Source: owner's supplied combat review; its Frankendom code/production claims
have not been independently audited here. Apply these lessons within the existing
milestones, not as an additional feature checklist or combat-engine replacement:

- Reuse wind-up/active/recovery attack definitions and a shared damage path. Tune
  for ARMAGEDOM's camera and group fights; do not copy duel timings wholesale.
- Assess one-input buffering and dodge responsiveness in the current demo; only
  add/change behaviour for a reproduced feel defect. Keep current controls.
- Tune the three enemy roles with reaction delay, aggression and recovery. Shared
  damage/cooldown rules matter; enemies need not share every player input command.
- Use bounded impact sound/flash/recoil as presentation. Camera effects must keep
  painted backdrop, depth masks and actors registered. Do not globally freeze
  combat or stack camera kicks in group fights; exact hit-stop values need review.
- In milestone 2, prove equipped weapon/armour changes actual damage dealt/taken
  before multiplying items; test both combat values and save/reload.
- Give the later boss a readable tell and achievable escape/counterplay. Do not
  import unavoidable percentage-health attacks. Defer posture bars, finisher
  libraries, directional guards, feint/riposte systems and large difficulty ladders.
- Keep existing hit queries unless measurement shows a defect or bottleneck; no
  speculative swept-blade port, spatial grid or general ability framework.

MMO direction does not require deterministic lockstep/rollback. Fixed-step timing
alone does not guarantee cross-machine determinism. Server-authoritative combat
with client prediction is another established model; choose through a bounded
multiplayer proof before large content expansion, under a separate owner scope.
For now keep combat rules/state separate from camera/audio/UI and centralise
equipment/damage decisions when touching them. No network package migration,
server, replay verifier or backend implementation is authorised by this note.
Reference: https://docs.unity.com/en-us/multiplayer/netcode/netcode

| Owner | Next concrete output | Dependency | Acceptance |
| --- | --- | --- | --- |
| Lead Dev | One short Westminster mixed fight using the existing basic melee, heavy melee and ranged roles; record combat defects and make only the largest necessary repair. | World releases its current north-left path test/build slot; preserve the current survivor candidate until owner art review. | Native move/slash/heavy/dodge, readable wind-ups/contact/damage/death, defeat or die/retry without stuck state; applicable full gates and Dom's combat-feel review. |
| Main Char | One survivor motion/grip/readability review at the saved London camera, using existing pilot evidence and the current front reference; identify the next single visual blocker. | Retain pending owner reference/character review; no new paid generation or replacement rig. Editor import only in an explicitly released slot. | Dom accepts the representative survivor in movement, attack, dodge and gear swap; structural checks remain supporting evidence. No enemy/outfit batch before that gate. |
| Visuals & World | Close the currently requested north-left pavement and connecting-lane traversal, then nominate one safe mixed-encounter placement in existing Westminster. | Own the active bounded path validation/build; encounter placement follows Lead's selected roster and combat review. | Exact marked paths work both ways, wreck/crates stay blocked, accepted east/south routes remain valid; zero-error build and native owner path review. No new area/art generation. |
| Deploy & Github | Prepare the local review package/checksum/rollback and exact launch instructions for the accepted combat demo. | Lead's tested demo and native acceptance receipt; do not start a competing build or promote unfinished source. | Package starts on the actual Mac; Windows remains explicitly unverified until tested there. Public upload/source promotion is a separate authorized step. |
| Strategy Dev | Review this single combat milestone against the approved scope and 2029–2030 narrative, keeping the next acceptance decision clear. | Current native combat/art receipts; no extra implementation owner. | One clear owner per output; ordinary combat accepted before the boss, then loot/save, then the three-area session. No fourth area or additional permanent lane. |

**Next owner demo:** one existing Westminster mixed encounter, roughly 3–5 minutes
of play, at zoom1.65/scale1.265 with the current controls and survivor candidate.
Review movement, enemy tells, attack contact, damage feedback, dodge, deaths and R
retry. Existing enemy artwork is reused and its presentation limits are disclosed;
this demo does not establish final roster-art acceptance. Reuse the present mixed
wave rather than introduce a new demo mode unless a concrete blocker requires it.
The boss is the next combat check after ordinary enemies feel fair; loot/equipment/
local save and the full15–20minute session remain subsequent gates.

Unity order: World finishes the bounded path closure and records explicit release;
Lead then owns the combat review/test/build slot. Main Char may prepare review
evidence outside Unity meanwhile. Deploy packages the accepted result afterward.
Use a fresh independent reviewer at the combat checkpoint, not another permanent
chat. Current technical checks and native owner acceptance remain separate.


## Owner amendment — six-action combat, 2026-10-03

Verified direct Lead-thread messages: Dom requests two normal attacks (slash and
stab for the starting sword), heavy, special, dodge and guard/block/parry. Sword
is only the start; the same action roles must support later weapon types. This
supersedes the earlier instruction to preserve all current controls and the
buffer-only combat demonstration. It does not authorise a full new weapon roster.

Strategy recommendation sent to Lead:
- Stable slots: Primary / Secondary / Heavy / Special / Dodge / Guard.
  Initial desktop mapping: LMB / RMB / Q / E / Space / hold F; update HUD and
  control instructions. Labels and animations reflect the equipped weapon.
- Sword: wide slash, narrow reaching stab, slower committed heavy. They must
  differ visibly and tactically. One equipped special remains separate.
- Future examples, not current deliverables: gun single/burst-or-precision/
  committed shot; launcher direct/alternate trajectory/committed salvo; drone
  attack order/reposition-or-recall/coordinated strike. Ammo and cooldown rules
  must constrain whichever future actions are actually implemented.
- Holding guard blocks eligible frontal hits with reduced movement and finite
  guard capacity. Depletion briefly breaks guard; recovery follows release.
  A brief initial press window parries explicitly eligible attacks and gives a
  short stagger. Late timing falls back to normal block; no separate finisher
  or riposte subsystem. Clear tells distinguish attacks requiring dodge/cover.
  Sword guard never implies catching rockets or blocking explosions.
- Attacking exits guard; dodge exits guard and clears queued attacks. Keep dodge
  cooldown and tuned heavy/special cooldowns; no stamina charge on every swing.
- Use a small shared attack definition and defence profile in existing runtime
  components. Separate weapon data from player action roles, without a general
  ability framework or speculative gun/drone implementations.

Lead owns implementation after World's explicit Unity release. Next acceptance
is an obvious native sword demonstration of all six actions: distinct attacks,
frontal block versus exposed side/rear, timed parry versus ordinary block,
guard break/recovery, dodge and death/retry. Reproduce relevant input/defence
regressions and run applicable gates, then obtain Dom's gameplay judgement.
Earlier38/38 combat checks cover the buffer candidate only, not this amendment.


## Owner approval — adaptable survivor, 2026-10-03

Dom explicitly agreed with Strategy's recommendation and requested delivery to
Lead. One survivor can learn different skills and equip different weapon types;
equipment-led specialisations replace permanent class locks. Melee, Gunner, Tech
and Bio describe future builds of that survivor, not four approved production
rosters. Bio's exact lore/abilities remain future design, not a mutation decision.

Learn broadly, equip narrowly: initially one active weapon, one selected learned
special and equipment-dependent defence. Retain six stable action slots: two
normal weapon attacks, heavy, special, dodge and guard. Weapon definitions change
attack behaviour; defence only counters eligible threats. Do not build a permanent
class picker, extensive skill tree or general ability framework now.

Delivery order: visibly distinct, satisfying six-action sword combat, accepted by
Dom in native play; then ONE basic gun to prove the same structure works for a
second weapon type before multiplying content. This bounded second-weapon proof
amends the earlier one-weapon-family-only restriction. Lead sequences it with the
existing first-session milestones. It does not authorise drone/bio/launcher
production, new areas, backend or networking. Preserve the sequential Unity slot.

The prior input-buffer fix is not acceptance of the broader combat upgrade.
The next demonstration must show an immediately noticeable gameplay improvement;
automated checks support, but do not replace, Dom's combat-feel acceptance.
