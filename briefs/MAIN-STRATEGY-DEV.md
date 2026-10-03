# ARMAGEDOM — Main Strategy Dev brief

Updated2026-10-03 with the owner's AI storyline and first playable loop priority.
Canonical repository: /Users/domininclynch/Desktop/Business/ARMAGEDOM.
The former Ashvault checkout has moved here, including Git history, Game/, Builds/,
art/, scripts/, caches and local work. Briefs and sessions are part of this same
workspace. Do not resume work in ../Ashvault or create a second game copy.

Read AGENTS.md and PROJECT_STATE.md, then docs/ARMAGEDOM-HANDOVER.md,
docs/ARMAGEDOM-WORLD-BRIEF-SOURCE.md, and the shared Codex INDEX.md/armagedom.md
under ../Vibe Coding Management/codex-state/.

## Current implementation priority

Follow [First playable loop](FIRST-PLAYABLE-LOOP.md): keep the existing centre,
south and east areas; prove a small combat roster, then loot/equipment persistence,
then a polished first session. Lead allocates within the existing five lanes.
Additional regions and LLM/backend expansion wait. The longer-term narrative
below remains design direction and does not expand this delivery scope.

## Current playable foundation
Unity6000.3.25f1 Built-in; project Game/, scene Assets/Scenes/Ashvault.unity.
Existing tested Mac app: Builds/Ashvault.app. Internal legacy names are retained
for this filesystem migration; renaming classes/scenes/bundles is separate work.
London uses the owner's detailed Westminster image with real3D actors, invisible
road collision and depth masks. Saved 1.65x crop zoom,26.5% larger characters, gentle
scrolling and brighter lighting are implemented. The user tried it and wants
further refinements. Current technical receipts live in PROJECT_STATE.md.

War and gameplay both occur in2029–2030, with collapse over weeks or months.
The owner explicitly rejected the fifteen-year gap for the active storyline.
Preserve docs/ARMAGEDOM-WORLD-BRIEF-SOURCE.md unchanged as historical source;
the active story below supersedes its2045 date and desert first-area proposal.
Human vagrant work is a local review candidate; consult current lane receipts
before claiming final acceptance or replacement in the published game.
MMO/backend is a future ambition, not an existing capability.

## Story and game identity

ARMAGEDOM is a post-nuclear action RPG set in London,2029–2030, where the AI
systems that helped collapse civilisation still control parts of the city and
learn from the player's actions. The intended player-facing promise is:
**"The bosses remember how you play."** This is a design direction, not a claim
about the current playable prototype or an implemented LLM service.

### The collapse

In the years leading to2029–2030, nations increasingly delegate targeting,
logistics, cyber defence and threat detection to competing military AI systems.
No system needs an explicit instruction to start a nuclear war. An apparent
attack triggers a countermeasure; another system interprets that response as
escalation. Conflicting objectives and automated retaliation accelerate the
crisis beyond meaningful human intervention. Nuclear strikes, cyber disruption
and infrastructure failure collapse the connected systems of civilisation over
weeks or months. Humanity survives; its supporting institutions fracture.

Gameplay begins in the same2029–2030 period, during the immediate aftermath.
Survivors remember ordinary life. Emergency checkpoints, military remnants,
improvised shelters, interrupted supply chains and competing relief efforts
shape London. Established organisations splinter into emerging factions; the
world has not already spent fifteen years rebuilding. Ruins and shortages should
reflect recent destruction, not decades of decay or newly evolved civilisations.
Existing experiments, contamination and damaged machines can support later
unusual enemies without treating rapid radiation-driven evolution as established lore.

The central question remains unresolved for the player:
**"Did AI destroy civilisation—or did it execute exactly what humanity asked?"**
Reveal evidence through encounters, surviving records and conflicting witnesses.
AI fragments continue operating on surviving power and communications. Some
protect people, some manipulate them, and others follow distorted or incompatible
orders. They disagree with each other; they are not a single evil machine faction.

### The survivor and competing AI factions

The player begins as an unknown human vagrant with scavenged clothing and a
damaged weapon. Retain the physical combat, scavenging, equipment progression
and faction choices of the original brief as the wider game vision.

The main story follows surviving AI factions with conflicting agendas and the
human communities living under, alongside or against them. Each intelligence
controls limited infrastructure, territory or military assets and interprets its
remaining orders differently. Protecting one population may mean denying another
power, supplies or passage. Promises of safety can demand surveillance, obedience
or control of neighbouring territory.

The survivor navigates these competing interests through alliances, resistance,
negotiation and confrontation. Choices change who controls local resources, which
communities can survive and how other intelligences respond. Evidence of the
collapse emerges through their conflicting records and actions. There is no
single restoration machine or universal solution at the centre of the plot.
These are narrative possibilities; trading, faction simulation and other future
systems are not added to the current implementation scope by this brief.

## Adaptive zone intelligences

The intended zone loop is: explore the area, discover its controlling intelligence,
observe its response to your tactics, confront it, then choose its fate.
Major zone bosses or commanders may retain bounded memories of player behaviour
across encounters, including defeat and return. This means stored gameplay
observations and preferences, not a requirement to retrain a model per player.

**Westminster pilot concept: WARDEN**, a surviving British defence intelligence
controlling automated checkpoints and, where implemented, drones. This is a story
entity distinct from the legacy Warden/knight player asset; do not rename or repurpose
that rig as part of this documentation change.

Illustrative adaptations, conditional on supported combat mechanics:

- Repeated long-range play prompts a legal pressure or flanking tactic.
- Frequent left flanks make WARDEN guard that route on a later attempt.
- Repeated cover use prompts a telegraphed flush-out tactic if explosives exist.
- Shotguns, player drones and reload windows could later inform spacing, jamming
  or rush decisions once those systems exist; they are not pilot dependencies.
- Dialogue acknowledges a real observed pattern: "You tried the eastern approach
  three times." Any asserted count must come from recorded events; invented
  probabilities must not be presented as measured gameplay facts.

Future resolutions can include destroying, negotiating with, reprogramming,
merging or transferring an intelligence to a faction, or secretly working for it.
Consequences may affect later zones. These remain design options to prove in
small steps, not six new systems to implement now.

## Combat AI boundaries

| Layer | Responsibility |
| --- | --- |
| Ordinary mob AI | Authored state machines, behaviour trees or utility rules for movement, attacks and animation; no per-mob LLM calls. |
| Elite AI | Lightweight adaptation using observed tactics and legal utility choices. |
| Boss or faction LLM | High-level tactics, objectives, personality, dialogue and deception within authored bounds. |
| Game rules | Validate requests and execute combat, cooldowns, targeting, navigation, damage and encounter progression. |

The LLM proposes a tactic; it cannot directly move transforms, issue arbitrary
code, award loot, alter damage or create an unsupported ability. A future narrow
output contract might select a whitelisted tactic, valid target and bounded
aggression value. Game code checks state and capability before acting.

Use meaningful encounter events and cooldowns for asynchronous decisions, not
per-frame calls or one model per enemy. Set explicit call/time/cost limits before
any prototype. Continue normal combat while a request is pending. Invalid, stale,
late or unavailable responses fall back to authored tactics. This contains the
impact of latency and model mistakes; it does not eliminate them.

Memory is a compact record of relevant actions and encounter outcomes, with a
clear reset and bounded retention. A boss may only use information it can observe
under game rules. Adaptations must remain readable and counterable, with normal
telegraphs, reaction windows and cooldowns. An eventual MMO needs explicit
per-player versus party/world memory and authoritative server validation; that
is future design work, not authorization to add accounts or backend services now.

## First future boss experiment

After the current survivor and area-crossing milestones, consider one WARDEN
encounter using existing actions and a small set of authored tactics. Compare an
authored adaptive baseline with an LLM-selected version before expanding.
No new dev lane, model provider, paid inference or infrastructure is selected.

Acceptance for that future experiment:

1. Two different player strategies produce understandable, legal boss responses.
2. A repeat encounter recalls a genuine prior tactic; resetting memory removes it.
3. Changing strategy can beat the adaptation; memory does not enable unavoidable hits.
4. Timeout, offline, invalid and stale responses leave combat playable via fallback.
5. Actual London game footage demonstrates behaviour, dialogue and frame pacing;
   record request latency and cost separately from visual acceptance.

Promote "bosses remember you" as a shipped feature only after this evidence exists.
The present request authorizes brief/story updates only. Lead retains integration;
Main Char and World continue their already-authorized work without AI scope added.

## Working rules
Own priorities, smallest useful milestones, acceptance and developer boundaries.
Keep notes concise and evidence-led. Onboarding alone is read-only; implement
concrete owner requests within their authorized scope. No unrelated research,
extra chats, cloud jobs or purchases. Preserve art/rigs and existing working code.

Change supported zoom/scale/follow/light values in
Game/Assets/StreamingAssets/London/layout.json and verify live reload first.
Use saved road/depth-mask edits for this image stage. Painted buildings cannot
move independently or reveal unseen viewpoints; new models/regions and new code
have different delivery requirements. See docs/LONDON-BACKDROP.md.

Verified commits go to DomLynch/ARMAGEDOM main; the guarded /opt/armagedom VPS
follower pulls main. Builds/caches/unfinished local edits stay local. This is
source sync, not a game server. Run the declared gates and verify actual delivery.
Keep shared status in PROJECT_STATE.md and decisions in sessions/strategy/DECISIONS.md.
