# ARMAGEDOM — mobile web first

> HISTORICAL PLAN — NOT AN ACTIVE ENGINE OR DELIVERY INSTRUCTION.
> Superseded by [Three.js only and Unity retirement](THREEJS-ONLY-RETIREMENT.md)
> and TEAM-AND-REUSE.md. Preserve this record for provenance; do not run its
> Unity/native commands, gates, slot allocations or public-download instructions.
> Carry applicable art, gameplay and device requirements into Three.js.

> Superseded engine decision,2026-10-03: Dom approved implementation of the
> Three.js migration. Follow [THREEJS-MIGRATION.md](THREEJS-MIGRATION.md).
> Unity-only/no-rewrite wording below is historical; device/rollback gates remain.

Owner approved 2026-10-03: freeze the current Mac playable and shift development
priority to mobile web, retaining PC browser play from the same Unity game.
Lead owns allocation, integration and delivery. This supersedes desktop-first
and browser-deferral wording in older briefs and monitoring prompts.

## First preserve the current game

Pin the current Mac app, exact source/content inputs, saved layouts and a short
receipt with hashes, launch instructions and known acceptance gaps. Preserve
uncommitted work and all lane candidates separately; do not reset, clean, blindly
merge or label the frozen prototype visually accepted. Include any externally
loaded settings needed to reproduce the frozen experience. No new native Mac
feature/release work. Mac Unity authoring and web builds remain permitted.
World may finish its currently running bounded validation and hand over its
isolated candidate; do not make the freeze depend on further native polish.

## Smallest useful delivery

One existing Westminster mixed fight, current survivor and six actions, accessible
at a versioned browser preview URL. Keep Unity 6000.3 and existing assets/gameplay;
no Three.js rewrite, new area, new weapon roster or MMO backend. Retain centre,
south and east content without making full three-area polish the first web gate.

Use one gameplay implementation: touch movement/aim/action HUD on phones and
keyboard/mouse on desktop browsers. Both input schemes invoke the same combat
rules, cooldowns, damage and retry. Design touch ergonomics deliberately: simultaneous
movement and attacks, aiming, guard hold/parry, dodge, no stuck input after focus
loss, appropriate safe areas and readable landscape UI. Preserve keyboard controls.
Platform differences belong in thin input/loading/save adapters, not duplicate games.
Audit actual Web build blockers first, especially filesystem-based StreamingAssets
loading, plugins, browser audio, memory/texture size and screen/input assumptions.
Fix demonstrated blockers only. A browser export is not automatically cross-play.

## Allocation using existing lanes

- Lead: freeze receipt, web compatibility and touch/combat integration; one build owner.
- World: preserve current camera/mask candidate at its next safe checkpoint, then
  only phone readability/crop/occlusion fixes identified by the web test.
- Main Char: only measured asset/memory or phone combat-readability blockers;
  retain original art and rigs, no new roster or redesign.
- Deploy: coordinate with Lead on a versioned web preview on existing authorised
  hosting; correct compression/MIME headers, cache/version handling and rollback.
  Keep frozen Mac download intact. No new paid service or public launch campaign.
- Strategy: scope and acceptance evidence. No additional permanent dev lane.

## Acceptance and handoff

Prove the actual served version on a physical iPhone Safari and Android Chrome,
plus desktop browser keyboard/mouse. Name devices/browser versions, transferred
bytes, cold time to playable, frame-time/FPS during a representative 10-minute
session, and crashes/reloads. Target 60 FPS; investigate sustained below 30 FPS
on agreed supported phones. These are initial targets, not achieved claims.
Demonstrate all six actions, enemy tells/contact, death/retry, audio after user
gesture, and background/resume without stuck inputs. Show Dom a phone-playable
link; desktop emulation and automated tests do not establish phone acceptance.
Compare responsiveness and combat feel with Frankendom; Dom judges the result.
Any unavailable physical-device check stays explicitly unverified.

Stop expansion until this fight is enjoyable and stable. F2P applies on all
platforms. Native mobile apps and desktop installers may be considered later;
networked cross-play/shared accounts/save and monetisation remain outside this
first test. No assumption that a browser client is an implemented MMO.

Use isolated visible worktrees and sequential heavy local Unity jobs. Existing
HF CPU offloading is preferred only where supported and verified; remote Unity
licensing is still unresolved. Do not make the first web preview depend on cloud
licensing, new infrastructure, duplicate Editors or unbounded build retries.
After two failures of the same stage, report the first broken stage and choose
a bounded alternative. Report frozen Mac, web build, served URL, device checks
and owner feel acceptance separately.
