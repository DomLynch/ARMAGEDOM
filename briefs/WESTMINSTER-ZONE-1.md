# ARMAGEDOM — Westminster Zone 1 story and playable architecture

> Active platform: [Three.js only and Unity retirement](THREEJS-ONLY-RETIREMENT.md),
> owner decision 2026-10-04. Unity/native instructions and public-retention rules
> in older records are historical; private recovery archives are not live rollback.

Updated 2026-10-04 from Dom's supplied narrative, enemy, escalation and map notes,
including attachment `a7ebfa8c-162b-4748-a585-9dc600e39923/Pasted text.txt`.
Dom's subsequent direct instruction to Lead, "lets keep it at 8 for now... we
have 3 already", takes precedence over the supplied ten-area proposal.
This is the consolidated planning direction. It authorises documentation and
planning, not immediate generation of the whole map, roster or AI infrastructure.
Lead retains implementation allocation under TEAM-AND-REUSE.md and newer direct
owner requests. PROJECT_STATE.md holds current delivery and acceptance receipts.

## Identity, timeline and terminology

ARMAGEDOM is a free-to-play, mobile-web-first action RPG, also playable with
desktop keyboard/mouse. Physical melee, scavenged equipment, recognisable ruined
London and competing AI-controlled territories define it. MMO is the longer-term
ambition; neither a browser client nor an account/save database establishes MMO
capability. Retain Three.js and the current fixed/elevated, gently scrolling
London presentation; preserve portrait and landscape controls.

War and gameplay occur in 2029–2030. Competing military AIs accelerate escalation,
nuclear strikes and infrastructure collapse over weeks or months. Survivors
remember ordinary life. The story asks whether AI destroyed civilisation or
executed humanity's instructions. Conflicting surviving intelligences, not EDEN
or a universal restoration machine, drive the main narrative.

Use **London = region; Westminster Collapse Zone = Zone 1; area = connected
playable space within a zone**. Westminster includes a deliberately compressed
cross-river route. Chelsea, City, Camden, Docklands, Greenwich and potentially
Baker Street/Marylebone are later location options, not a committed zone count.
This supersedes earlier suggestions that London itself is Zone 1 or that the
first Westminster beta requires ten areas. Five or six remains a useful
intermediate checkpoint. A 10–20x larger London is a long-term vision, not a beta
asset quota, area multiplier or promised traversal time.

## Beta target and immediate boundary

- Cap **8 connected areas total: 3 existing + 5 planned additions**. Do not treat
  eight as a minimum or expand to ten without a newer owner decision.
- Target **45–75 minutes** for a first playthrough; validate with new players,
  excluding artificial padding, repeated deaths and excessive backtracking.
- Reuse the three existing environment visuals; plan up to five additional
  environment concept groups after layout mapping. Concept count is not runtime
  scene, downloadable image or playable-area count; no fixed image quota.
- One semi-open district with a guided initial route, alternate paths and earned
  shortcuts. Not ten disconnected arenas or a geographically literal city map.
- Executioner is the principal miniboss; Centurion is the physical zone boss;
  WARDEN is the intelligence directing the battlefield and survives this finale.
- Keep the existing centre/south/east footprint as the first playable milestone.
  New areas, enemy families, firearms and WARDEN mechanics enter implementation
  through bounded Lead plans and owner scope, not all at once from this document.

## Reinterpret the character library

Reuse pinned Frankendom bodies, silhouettes, rigs and compatible animations.
Keep originals untouched and record source revision, hashes and provenance.
Create ARMAGEDOM-specific material/gear derivatives; donor fantasy names are
production references, not necessarily player-facing identities or ten classes.

| Donor body | ARMAGEDOM interpretation | Presentation direction |
| --- | --- | --- |
| Centurion | Former military commander aligned with WARDEN's local control | Roman-inspired silhouette made from riot composites, ballistic plates and remnants of ceremonial kit |
| Executioner | Checkpoint/facility enforcer | Industrial mask, improvised armour and heavy breaching weapon |
| Pitborn | Pre-collapse military/bioengineering subject released by the collapse | Restraints, medical hardware, damaged protective equipment |
| Goblin | Small, fast engineered/altered scavenger archetype | Scavenged clothing, respirator, tools and improvised weapons |
| Dwarf | Compact, powerful engineered/altered human archetype | Heavy work gear and reinforced equipment; physique alone does not determine hostility |
| Witch / Shieldmaiden and remaining bodies | Later biotech specialist, protected soldier or faction leader candidates | Preserve recognisable silhouettes while replacing fantasy-only materials and identity |

Use Kevlar-like fabric, road signs, scrap, wiring, batteries and medical equipment
where appropriate. An outfit change may require fitted geometry, not just a colour
swap. Review grip, motion and silhouette in the actual fight camera before batching.
Extreme body changes arise from pre-existing experiments or fictional alteration;
do not imply radiation evolved new species in a few weeks. Reserve distinctive
boss treatments for later zones, but compatible base bodies can also support elites
or ordinary enemies. A reused body does not by itself make a boss encounter.

## The Hollow and enemy hierarchy

**The Hollow** is the working name for a fictional affected population. Emergency
synthetics/stimulants, contaminated supplies, neurological injury and prior
experimentation contribute to different conditions. Any chronic history predates
the recent collapse. Not every affected person is violent or an enemy. Survivor
settlements contain noncombatants; do not equate poverty, homelessness or addiction
with automatic hostility. Enemy status comes from behaviour and faction allegiance.

Visual language: tents, carts, scavenged clothes, respirators, damaged tracksuits,
erratic or exhausted motion and improvised tools/weapons. Preserve readable attack
tells; unsettling movement must not make damage unpredictable.

| Tier | Role | Asset strategy |
| --- | --- | --- |
| Common | Frequent small-group fights | Initially 3–4 compatible base bodies, shared motion/materials where possible, inexpensive outfit variants |
| Specialist / elite | Change player priorities and protect objectives | Distinct weapon, silhouette, telegraph or behaviour; medium detail |
| Named boss | Story confrontation and mastery test | Highest presentation budget, distinctive gear, phases and encounter staging |

Westminster's **candidate full-beta roster**, not the immediate import list:
Hollow Rusher, Hollow Scavenger, Hollow Gunner, Militia Rifleman, Militia Heavy,
Watcher Drone, Hunter Drone and Sentry Turret, plus Executioner and Centurion.
Hollow Brute is an alternative heavy role, not an automatic ninth common enemy.
Mutant animals and additional robots are later options. Guns, shotguns, explosives
and player drones are dependencies to implement and review separately; their names
here do not establish working combat systems.

Start by proving a few distinct roles with existing suitable assets, then combine
them differently across the zone. Three or four bases might support 20–30 visual
variants, but no such batch is required for the first encounter. Hundreds/thousands
of placements across the eventual world do not require that many unique models or
simultaneously active actors. Preserve the six action roles across weapon families.

## Proposed connected map

Numbers identify eight planning slots, not separate loading screens. First preserve
the three existing spaces, then assign five additions. Labels for existing south/
east are provisional until World confirms their visible geography and boundaries.
Area dimensions, encounter duration and exact connections remain layout decisions.

| # | Area | Play purpose and narrative beat |
| --- | --- | --- |
| 1 | Existing centre — Westminster Ruins | Parliament/Big Ben opening, refuge and immediate objective; movement, melee, stamina and first useful reward |
| 2 | Existing south — continuation/checkpoint | Wider mixed encounter and Watcher observation; reuse its actual geography rather than claiming it is Whitehall |
| 3 | Existing east — bridge approach | Traversal/detection set-piece, subject to proving the crossing and bank connection; preserve accepted art |
| 4 | Parliament Square / Whitehall | Combined government-ruins and checkpoint area: barricades, militia, later ranged defence and first transmissions |
| 5 | Westminster Underground / Ministry access | Interior change of pace, records and PA; Executioner guards the bunker access within this space |
| 6 | Embankment / service route | River path, supply detour and return shortcut; growing profile feedback and patrol pressure |
| 7 | South Bank Encampment | Survivor ruins, noncombatants and hostile groups with distinct roles; scavenged technology and a return route |
| 8 | WARDEN Control Sector / Citadel | One final area with an approach and arena: bounded automated defences, then Centurion with WARDEN support |

Proposed loop: 1 ↔ 2 ↔ 4, with 4 ↔ 5 and 4 ↔ 6; 6 reconnects to 1 and to
bridge approach3, which reaches7 after a verified crossing. Return over3 to reach
the final sector8 through an unlocked north-bank checkpoint. Underground5 gains
a return shortcut to1; bunker access and Executioner sit inside5, not a ninth area.
Introduce observation on the early loop, then the bridge escalation, before opening
the deeper facility fight and finale. Exact progression locks remain to be tested.
Combine the original ten-area proposal's Ministry/Underground and Control/Citadel
beats; any remaining Whitehall/Square detail is part of4 or existing scenery.
Validate walkable connections on the layout. Do not
silently join South Bank to a north-bank bunker through an unexplained tunnel or
teleport. Geography is compressed intentionally, with legible transitions.

The three existing visuals are **centre, south continuation and east/bridge
continuation**, not proof that South Bank, a full bridge crossing or three named
areas above already work. World first maps their actual content, road bounds,
entrances and exits onto this plan without replacing accepted art. Complete
centre–south–east round trips in the served game before claiming continuity.

Proposed art grouping: retain the three current concepts; prepare five additional
concept groups when scheduled: Square/Whitehall, Underground/Ministry, Embankment,
South Bank and Control Sector/Citadel. Shared art language can support multiple
areas but each runtime backdrop still needs suitable coverage, collision, depth
masks, entrances, exits and portrait/landscape checks. Cropping one image does not
automatically create new traversable spaces or unseen interior views.

## WARDEN escalation and story delivery

WARDEN is a surviving defence intelligence with limited sensors and controlled
infrastructure. It is not omniscient and does not represent every surviving AI.
Use Tube announcements, emergency speakers, radios, damaged screens and drones
to reveal it gradually; preserve ARMAGEDOM's own sound and visual identity.

1. Early centre/south: observe; a Watcher sees the player and attempts to report.
2. Government route/Underground: identify; transmissions and PA reveal interest.
3. Embankment: profile; acknowledge observed range/routes or insufficient data.
4. Bridge approach/crossing: escalate; sentry signals, then reinforcements arrive.
5. South Bank and deeper facility: adapt with visible escape/counterplay options.
6. Control Sector/Citadel: coordinate supported defences and assist Centurion.

Signature event: **sighting → transmission → alarm/brief overlay → distant response
audio → approaching reinforcement → encounter → cooldown/reset**. Initial design
targets are a 2–3 second informational overlay and a roughly 10–20 second response
delay, tuned through play; neither blocks controls nor waits synchronously on a model.
Keep stamina, enemy tells and movement visible. Offer reduced interference effects.
Provide counterplay such as breaking sight, interrupting transmission or moving away;
the exact supported options are scoped with the encounter. Prevent repeated alarm
stacking, unavoidable spawn surrounds, permanent exit sealing and unlimited spawns.

Example fiction: `SUBJECT TRACKED / WEST ROUTE PREDICTED / RESPONSE INBOUND`.
Real counts must come from observations. Avoid invented precision such as a measured
"37% complete" profile unless a defined game rule produces it. Distinguish WARDEN's
fallible prediction or authored bluff from authoritative player HUD information.
Deceptive announcements are a later feature, never a reason to hide lethal tells.

## AI and playable architecture boundaries

Retain the existing modular Three.js client; add only the next needed behaviour.
No generic encounter platform, engine rewrite or separate active combat engine.

| Responsibility | Boundary |
| --- | --- |
| World content | Area identity, registered geometry/masks, exits, safe entries and encounter locations; World owns the data/layout |
| Combat and ordinary AI | Movement, aiming, hit detection, attacks, stamina, cooldowns and navigation execute through game rules |
| Encounter state | Bounded spawn budget, alert stage, objectives, death/retry and completion; Lead/Combat integrate one owner per module |
| WARDEN director | Summarise observable behaviour and choose only supported tactics; start with authored rules |
| Presentation | HUD/alarm/voice/effects express encounter events without owning damage or progression |
| Persistence | Versioned encounter/save observations through the existing isolated foundation; no client loot authority |

Future LLM input is compact telemetry: observed range preference, visited route,
supported weapon use and recorded encounter history. Health knowledge must follow
the AI's observation rules. Output selects an authored tactic ID, target/route,
reinforcement preset and optional taunt ID. Validate identifiers, availability,
cooldowns, observation scope, maximum units and remaining encounter budget.
For example, `ENCIRCLE + WEST + DRONE_PAIR + RANGE_TAUNT` is legal only if those
assets/routes/actions exist and the event budget allows it. Never execute generated
code or invent weapons, units, door controls, rewards or arbitrary map edits.

Prototype **3–5 authored tactics** first. The supplied 20–30-action catalogue and
8B–12B model size are future evaluation suggestions, not requirements or evidence
of achievable latency/quality. No provider, model, endpoint or paid inference is
selected. Compare a model-assisted candidate against the authored baseline on
observed player benefit, response time, invalid outputs and cost before adoption.
Calls are asynchronous and event-driven with timeouts and rate/cost limits. Reject
stale decisions; unavailable/invalid/late output falls back to authored behaviour.
Memory is bounded observations, not retraining. Later multiplayer must explicitly
define party/player/world memory and server authority before shared-world launch.

## Performance and asset budgets to validate

Maintain strong silhouettes, motion and contact at all tiers; cheaper common mobs
do not mean deliberately poor visual quality. Assess mesh/texture memory, material
count, draw submission, skinning, AI, navigation, collision and effects together.
Share compatible rigs/clips/materials, bound nearby active enemies, simplify
hitboxes, reduce distant updates and use limited shadows. Avoid routine ragdolls.
Apply pooling, atlases or LODs where measurement justifies them; shared skeleton
design does not automatically mean one animation calculation for every actor.

Supplied triangle ranges are **unvalidated per-model starting hypotheses**:
boss 20–40k; common near 5–10k; mid 2–4k; far 1–2k. They are not acceptance limits
or a guarantee for skinned mobile-web crowds. Set final budgets from on-screen
size, total visible cost and named physical devices; do not assume a face occupies
40–80 pixels at the selected camera. Never decimate donor originals in place.

Begin a mixed encounter around 4–6 active enemies as a design/test target, then
measure representative frame pacing and readable two-thumb play before raising
counts. "Dozens of red sensors in fog" can be atmosphere; it does not require
dozens of fully simulated combatants. Load needed area/actor assets selectively;
do not preload every district, 100 donor ranks or every cosmetic at startup.
Record cold/warm transfer, first-playable time, decode, memory and frame pacing
with device/browser/network/cache conditions. No universal count or FPS claim yet.

## Finale and later London

Centurion falls; WARDEN briefly goes silent. After the earned reward, screens
announce `WESTMINSTER NODE LOST / SUBJECT CLASSIFICATION UPDATED / THREAT CRITICAL`.
A stylised district overview hints at later London territories and ends with
**WARDEN IS WATCHING**. This is narrative UI, not a camera change to the playable
backdrop or proof those zones already exist. WARDEN loses local control rather
than being physically killed. Later AI territories have conflicting agendas;
negotiation and alternate resolutions remain future story possibilities.

## Delivery sequence and acceptance

1. **Current foundation:** preserve selected006 visuals and current stamina008
   comparator; finish outstanding physical-phone, six-action, stamina/guard,
   audio and complete-fight acceptance. Use current receipts, not old Unity checks.
2. **Existing three-area session:** prove registered travel, a few readable enemy
   roles, objective/reward/equipment/save/retry and a satisfying 15–20 minute loop.
   Exact new content remains a bounded Lead assignment, not this document's launch.
3. **First WARDEN event:** one Watcher detection and authored response on existing
   supported content; show observation, warning, counterplay, budget and reset.
4. **Expand Westminster incrementally:** validate a five/six-area route, then the
   eight-area beta cap; add Executioner/Centurion and more enemy roles as their
   dependencies prove worthwhile. No parallel batch of all new art/areas.
5. **Optional model comparison:** only after the authored encounter works; prove
   useful legal adaptation, real recall, fair counterplay and offline fallback.
6. **Beta gate:** five uncoached players, full district progression and shortcuts,
   no trap/reward duplication, complete encounters/death/retry/save, physical
   iPhone Safari/Android Chrome and desktop evidence, and Dom's feel acceptance.
   Measure the 45–75 minute target; shorten or reshape weak content before padding.

Lead allocates through the nine existing lanes: World map/art integration/audio;
Characters fitted derivatives; Combat behaviours/encounters; Web/UI signals and
controls; Backend isolated persistence/authority contracts; Deploy immutable
packages; Auditor independent milestone review; Strategy scope/story consistency.
No new lanes, purchases, mass generation, production DB changes or MMO networking
are triggered by this planning update. Keep reviewed Three.js versions for live rollback; Unity/native inputs belong
only in the verified private archive. Existing approved suitable HF CPU limits and donor isolation remain.
