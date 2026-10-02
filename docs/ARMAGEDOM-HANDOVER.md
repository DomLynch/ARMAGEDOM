# ARMAGEDOM — development handover

**Prepared 2026-10-02. Canonical workspace:** `/Users/domininclynch/Desktop/Business/Ashvault`.
**Purpose:** carry the existing playable prototype into an original near-future,
post-nuclear action RPG. Preserve the working foundation; change its setting,
presentation and eventually its weapon systems. This handover is documentation;
the installed game has not been converted or renamed.

## 1. Owner direction and source precedence

- Working title: **ARMAGEDOM**, using the spelling in the supplied world brief.
- Keep the close elevated/isometric camera and physical, readable combat. The
  scene is fully 3D; “2.5D” describes its controlled presentation. No shoulder/FPS pivot.
- Keep the existing room and reusable character bodies for the first conversion.
- Replace medieval fantasy with worn contemporary equipment, scavenged armour,
  survivors, raiders and mutants. Existing orc proportions can temporarily carry
  a heavy raider or mutant; they are not final human anatomy.
- Aim for grounded Fallout/Mad Max/Metro atmosphere with an original identity,
  not copied characters, factions, branding or assets. Avoid cartoon proportions,
  glossy science fiction and excessive combat effects.
- Keep scope small, edits efficient and dependencies justified. No purchased
  asset/tool requirement or paid cloud GPU. Open-source tools and appropriately
  licensed assets are acceptable; retain provenance and license evidence.

**Timeline discrepancy:** the direct request says the game is set in **2029–2030**.
The attached brief places the collapse in those years and play around **2045**.
For handover, 2029–2030 is the working gameplay period because the direct request
takes precedence. Do not silently canonize the 15-year gap. The source is preserved
unchanged in [ARMAGEDOM-WORLD-BRIEF-SOURCE.md](ARMAGEDOM-WORLD-BRIEF-SOURCE.md).
Before writing dated quests, resolve whether play is during/immediately after the
collapse or fifteen years later. Near-collapse play implies fresh damage, surviving
institutions and emerging factions; mature successor societies require revision.

Enemy categories should describe behaviour or fictional affiliation: raiders,
hostile scavengers, nomadic gangs, soldiers, mutants. Ordinary displaced people,
travellers and civilian scavengers can also be neutral or allied; ethnicity is not
an enemy class.

## 2. Current shipped prototype: what actually exists

| Surface | Current state |
|---|---|
| Engine | Unity **6000.3.25f1**, Built-in renderer, project `Game/` |
| Delivery | Local Mac application `Builds/Ashvault.app`; no web URL or public release |
| Source baseline | Git HEAD `3500136`, “Widen selected camera framing another fifteen percent”; no configured remote |
| Runtime size | **1,009 physical lines across 10 C# scripts**, recounted for this handover; excludes editor tools, tests, assets and dependencies |
| Playable content | One arena, three waves of **5 / 6 / 1** enemies, melee, dodge, pickups/upgrades and final heavy enemy |
| Character roster | **One playable Warden**, plus Revenant, Orc Executioner and Plague Warlock enemy models; “four characters” means hero plus three enemy bodies |
| Art | Original character geometry/material pipeline, 4K PBR maps, replaceable visual children separated from gameplay colliders |
| Controls | WASD movement; LMB slash/hold-repeat; Q or RMB heavy; Space dodge; 1 shockwave; R restart; V inspection; scroll zoom |
| Targeting | No click-to-move; full 360° facing; hero/enemy attack cones and floor outlines removed |
| Camera | Orthographic size **4.49075**, pitch **30°**, yaw **−32.005°**, scroll range **3–8**, smooth follow and forward framing |
| Encounter spacing | Columns 1.7m apart, first row Z=−1, subsequent rows 2.4m apart |
| Online systems | No networking, accounts, persistence backend, shared world or MMO infrastructure |

Camera choice and widening were tried by the owner and described as better.
Keep this baseline unless explicitly changing it. The additional 15% widening
is already included in 4.49075; do not apply it a second time.

**Evidence re-read on 2026-10-02:** `artifacts/playmode-results.json` records
**15/15 passed**, zero failed/skipped/inconclusive. `artifacts/build-summary.json`
records `build_8274b555f926`, Succeeded, **zero errors**, one expected Pipeline
warning, 488,065,862 bytes, 5,177ms. `artifacts/player-smoke.json` records ready,
no exceptions and four seconds observed. These are existing receipts, not tests
rerun for this documentation task.

Previous native checks recorded startup, movement/dodge, first-wave roster,
incoming damage/death, restart and the selected camera. They do not prove a full
run, sustained performance or current process state on another developer's machine.

## 3. Quality status: improved, not finished

Authored CC0 motion has replaced the earlier purely synthetic gait: Sprint for
the hero/Revenant/Warlock, Walk for the Orc. Playback uses actual travel distance,
transition blending, acceleration, cosmetic sole contacts, gradual enemy facing
and reverse Warlock retreat cadence. Damage follows anticipation; dodge cancels
pending player strikes. Original meshes, rigs, weights, materials and existing
idle/attack poses were preserved during the retarget pass.

**Still open:** continuous weight transfer, hip/shoulder coordination, starts/stops,
hand/weapon grip, attack polish, faces, simple weapons and environment quality.
The owner previously found walking artificial; later positive feedback is not an
explicit final locomotion acceptance. Neither 4K maps nor passing tests proves
natural motion or AAA visuals. Native full-clear, difficulty/pacing, sustained FPS,
memory/texture budget and Windows remain unverified.

Review at the actual game camera, then side view and inspection view. Useful
evidence: `artifacts/locomotion-{before,after}.mp4`,
`artifacts/{revenant,orc,warlock}-authored.mp4`, and
`artifacts/mob-motion-review/`. Camera alternatives are previews under
`artifacts/camera-options/` and `artifacts/camera-slant/`; the live baseline is above.

## 4. Narrative to retain from the owner's brief

A cascading crisis, infrastructure failure and limited nuclear exchange destroy
the systems supporting society. The player begins as an unknown survivor, not a
chosen one. The intended loop is **fight → scavenge → loot → upgrade → explore →
trade → choose allies**. Water, fuel, ammunition and functioning technology matter.

The long-term mystery is **EDEN**, a buried pre-collapse system capable of restoring
power, clean water and manufacturing, potentially also tied to the catastrophe.
It can be seeded with one clue before building a large quest system.

Keep the six proposed factions as a small narrative palette, with their status
adapted to the final timeline: Authority, Free Settlements, Reavers, Vaultborn,
Changed and Machine Cult. Their names and detailed implementation are concepts,
not shipped systems. Avoid purely good/evil faction design.

Use repaired 2020s civilian/military equipment and improvised engineering. Start
with pipes, machetes, axes, pistols and rifles. Rare drones, powered armour and
experimental equipment belong later. Mutations are fictional worldbuilding;
biological experimentation can explain unusual bodies in an early timeline.
Replace magic with plausible equipment where useful; a fantasy-to-tech analogy
does not oblige us to implement teleportation, shields or every old ability.

## 5. Smallest useful conversion — proposed next work

First establish the new identity inside the **existing room**, not a new open world.
Treat it as a ruined checkpoint/service yard or bunker-adjacent depot, preserving
traversal and encounter footprint while replacing medieval surfaces and props.

| Existing element | First conversion candidate | Important limit |
|---|---|---|
| Warden hero | Survivor with scavenged clothing, plates, boots and improvised melee weapon | Preserve movement/controller; armour replacement still needs deformation/grip review |
| Revenant | Light raider/hostile scavenger | Reuse body and rig first; readable ordinary human silhouette |
| Orc / final heavy | Heavy raider or experimental mutant, scrap armour | Temporary oversized body; no promise that recolouring makes it human |
| Warlock | Chemical raider initially; rifleman as a later combat addition | A staff reskin is not working firearm aiming, reload or recoil |
| Gothic floor/walls | Cracked concrete/asphalt, barriers, industrial debris | Retain collision/readability; do not obscure actors with clutter |
| Fantasy names/effects | Grounded encounter labels and restrained impacts | Rework/remove shockwave only with clear new gameplay semantics |

Suggested order, each with an observable acceptance check:

1. **Persistent camera tuning:** support the repeated small edits already requested.
   Prove one saved live camera change without restarting, persistence after restart,
   invalid-value rejection, scroll/inspection compatibility. This capability is
   recommended and **not implemented yet**.
2. **One survivor plus one raider pilot:** prove the new art direction at the approved
   camera before modifying the full roster. Check walk, turn, stop, strike, dodge,
   grip and feet in continuous native footage, not only a beauty still.
3. **Convert the room and remaining bodies:** compare identical combat framing,
   preserve clear routes, inspect collisions and profile the actual Mac build.
4. **Add one firearm and one ranged foe:** define aiming, range/obstruction, ammunition,
   reload, recoil and damage timing first; test these before adding more weapons.
5. **Expand only after the one-room slice works:** the owner's larger target is a
   10–20-minute highway/settlement/bunker route, basic and heavy raiders, rifleman,
   mutated animal and boss, a useful loot upgrade and an EDEN clue. This route,
   animal rig, loot depth and exploration are new work, not current capabilities.

No implementation is included in this handover. Retain the local repo/app names
until a scoped rename is worthwhile; renaming paths now adds migration work without
improving the prototype. MMO is a longer-term ambition: prove one bounded multiplayer
zone, persistence and measured capacity before scaling zones or promising population.
The local single-player contract still applies until multiplayer work is explicitly scoped.

## 6. Lessons to carry forward

**Animation and art:** preserve original geometry, UVs, skin weights, rest matrices
and material bindings when changing motion. Measure stride from planted feet.
Check actual deformed soles, not just bones; inspect between exported keys and
transitions. Coarse exports hid foot penetration. A planted foot can exceed knee
reach; weapon carry can create new floor penetration. Test each body and weapon,
including retreat, turns, stopping and attacks. Do not weaken thresholds to pass.
Keep detailed render meshes separate from simple gameplay colliders.

**Compute:** local headless Blender/CPU works for retargeting, baking and conversion.
Unity can remain in persistent local batch mode with Metal for rendering; a visible
Editor window is not required. Graphics-free tests cannot validate appearance.
Recorded HF Pro work used CPU Upgrade, 8 vCPU/32GB at $0.03/hour, bounded to 15 minutes;
reconfirm rate/hardware when launching another job. Pro is not unlimited free compute.
CPU Blender capacity does not make GPU-only TRELLIS inference CPU-compatible.
Original reconstruction used the shared TRELLIS.2 demo; do not silently rent a GPU.

**Tool decisions already investigated:** reuse Unity CLI/plugin, Blender Python and
the pinned Mesh2Motion CC0 animation source. Material Maker is deferred until a real
material task. No runtime Sentis requirement, architecture framework swap, second
coding IDE or unspecified HF Blender add-on is needed for the current slice.
QuadRemesher was excluded as paid. Research findings and licenses are recorded in
`art/tooling-review.md` and `art/snyk-skill-review.md`; refresh time-sensitive claims
before installing anything. HF model access, source-code licenses and commercial
asset rights are separate questions.

**Iteration:** existing camera defaults are hardcoded, which is why prior changes
required a new player build. Use saved settings for supported values, reusable
scene/prefab content for placement, and code builds for new behaviour. Addressables
can deliver compatible non-code content once integrated; downloading content is
not the same as activating it. None of that live-content infrastructure exists here yet.
Use incremental builds; recent camera builds took roughly 4–5 seconds for the build
step, not the whole validation/relaunch cycle. Do not rebuild for a document edit.

**Failure lessons:** “Succeeded” once accompanied thousands of TypeDB errors; check
error count too. Stop the Editor before diagnosed cache repair; preserve needed
files. Do not routinely clear Library. Input tests once suffered desktop/focus
interference; isolate test input instead of weakening assertions. Let domain reload
finish before retrying disconnected editor commands. Native smoke is not visual QA.

**Future publishing:** separate development, test and public versions. Keep rollback
and compatible client/content/server-world versions. MMO combat, inventory, currency
and trades need server authority. Blocking world edits must coordinate collision,
navigation, occupied positions and newly joining clients. Do not introduce a backend
or paid service simply because this handover discusses future scaling.

## 7. Where the next developer starts

Read `AGENTS.md`, `PROJECT_STATE.md`, this handover, then the preserved narrative.
Codex coordination is in
`/Users/domininclynch/Desktop/Business/Vibe Coding Management/codex-state/ashvault.md`.
Use the existing canonical repo; do not create a second project or edit Claude records.

Known runtime entry points in `Game/Assets/Scripts/`:
`RunManager.cs` (run/camera/spawns), `HeroView.cs` (zoom/inspection),
`PlayerController.cs`, `EnemyController.cs`, `ArtMotion.cs`, `ArenaBuilder.cs`,
`Health.cs`, `LootPickup.cs`, `CombatEffect.cs`, `SimpleHUD.cs`.
Use required CodeGraph/Semble discovery before broader implementation; preserved
Library backups have polluted some search results, so verify returned file paths.

Reusable global Codex skills under `/Users/domininclynch/.codex/skills/`:

- `game-iteration-publishing/SKILL.md`: tuning, content/code release split and MMO boundaries.
- `unity-blender-cpu-art/SKILL.md`: preserved-rig import, retarget, shader and game-camera checks.
- `blender-procedural-assets/SKILL.md`: original procedural mesh workflow and executable checker.
- `3d-modeling`, `blender-automation`, `shader-techniques`: focused supporting workflows;
  read their current scope before use. Unity CLI guidance comes from the Unity plugin.

Skills are installed on this machine, not automatically on other developers' machines.
No third-party skill bundle was blindly installed. Project evidence remains in the repo.

For future gameplay changes, run the declared gates from the repo:

```sh
python3 scripts/verify.py
python3 scripts/smoke_mac.py
```

Use Unity CLI with the real `Game/` path and required caller/skill provenance.
Build the replacement before claiming it is installed; verify the native app after
relaunch. Report saved source, tests, packaged build and observed native behaviour
separately. Never interrupt the owner's play session just to collect another screenshot.

At handover, pre-existing tracked changes include `ProjectSettings.asset`,
`TimeManager.asset` and `artifacts/playmode-results.json`. Preserve them and unrelated
Blender sources, captures and cache backups. Do not use broad staging or cache deletion.

**Next implementation acceptance:** a modern survivor and raider visibly fighting in
the same room at the current camera, with preserved controls, credible continuous
motion, passing regression gates and measured native performance. The timeline
decision is needed before dated narrative, not before reversible visual prototyping.
