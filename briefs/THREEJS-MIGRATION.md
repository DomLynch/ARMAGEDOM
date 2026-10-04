# Three.js migration — approved implementation

> Active platform: [Three.js only and Unity retirement](THREEJS-ONLY-RETIREMENT.md),
> owner decision 2026-10-04. Unity/native instructions and public-retention rules
> in older records are historical; private recovery archives are not live rollback.

> 2026-10-04: TEAM-AND-REUSE.md now authorises the nine-lane team, bounded
> maintenance, Frankendom reuse pilot and backend foundation; its scope supersedes
> older blanket no-new-dev/no-backend restrictions below.

2026-10-03. Dom explicitly approved: "lets move to three.js.. start the conversion over and manage the devs". This supersedes assessment-only status and Unity-only/no-engine-rewrite wording in earlier briefs and monitors. Start implementation now; no further engine-choice approval gate. Canonical repository stays ARMAGEDOM; Unity/native inputs now belong only in the private recovery archive.

## Outcome and sequence

One mobile-web-first Three.js game, also playable with desktop keyboard/mouse.
First port one COMPLETE existing Westminster encounter: current Vagrant, original London artwork, current mixed enemies, all six actions (Slash, Stab, Heavy, Special, Dodge, Guard/timed Parry), damage/death/retry and audio. Preserve behaviour and visual identity before improving unrelated systems. Then convert the existing centre/south/east continuity; no fourth area. The first fight is a delivery checkpoint for the approved migration, not a new vote on engines.

Current Three.js008 is the public baseline. Preserve lane candidates and original portable assets. Archive Unity/native inputs privately before removing active code and public payloads; old Unity pages lead to Three.js. Future candidates use immutable URLs and reviewed Three.js rollback. Disclose missing physical-device checks.

## Existing lanes and ownership

- Lead: integration owner; create a minimal isolated web client in existing visible lead worktree, choose and publish shared file/data boundaries immediately, port combat/input/AI/waves/collision orchestration and responsive HUD. Allocate one owner per file/module; inspect actual Frankendom reusable input/loading/UI helpers without modifying that game or copying its whole engine/rollback/duel systems. Use the nine registered lanes in TEAM-AND-REUSE.md.
- Visuals & World: port existing London image/layout/road/mask/projection/occlusion/scrolling data into a bounded Three.js world module under Lead's contract. Preserve saved registration and calibration. First Westminster movement/collision/depth proof; then south/east transitions. No new images, regions, lighting redesign or independent framework.
- Main Char: export only required current survivor/enemy rigs, textures and clips to browser-suitable glTF/GLB candidates, retaining originals/provenance. Verify materials, axes/scale, grips and action timing. Unity ArtMotion procedural overlays need explicit port/equivalent ownership with Lead: FBX clip playback alone is not parity. No new roster/remesh/redesign. Publish one survivor sample and manifest early so integration is not blocked on batch conversion.
- Deploy: prepare existing host for versioned Three.js previews and cache/compression/MIME/manifest checks. Keep current Three.js008 and TLS renewal; retire Unity/native public links under the retirement contract. Publish only Lead's exact candidate, then verify served inputs. No Electron, new infrastructure or paid service.
- Strategy: scope, lane boundaries and evidence; monitor Lead every ten minutes. Lead's existing team monitor coordinates peers; no duplicate report-back loops.

Lead owns the brief integration checkpoint and may refine file boundaries without additional owner permission. Source/assets work can proceed concurrently in isolated lanes; heavy local jobs stay sequential. No active Unity editor, builds or test gates. Inspect archived references only when necessary; do not reactivate engine tooling. HF CPU jobs only if suitable, authenticated and actual approved32GB/$0.03 tier verified, bounded and stopped with outputs preserved; no cloud licensing detour/GPU rentals.

## Minimal technical boundaries

Use Three.js with the smallest needed tooling, pin dependencies and retain lockfile. Lead chooses JS/TS based on actual reuse; no ECS/plugin architecture project, engine abstraction, generic editor or new physics stack without a demonstrated requirement. Separate thin touch/keyboard adapters from shared combat rules. Reuse gameplay numbers, art and layout data; C# behaviour must be ported and tested, not assumed convertible. Document gaps rather than substituting placeholder motion or removing enemies to win size comparisons.

Apply MOBILE-HUD-FRANKENDOM.md touch principles: two-thumb movement/aim/actions, circular transparent controls, compact HP/objective, burger menu, safe areas/browser chrome, clean portrait handling, input release/cancel/background safety. No silent auto-fire/targeting or altered guard/parry semantics. Browser responsive layout is not networked cross-play.

Load only the first encounter's required assets initially; preserve other content for later loading. Measure transferred bytes and download/decode/start-to-interactive separately. Do not copy Frankendom's total asset payload or claim its3–4s timing automatically applies. WebGL-compatible phone support is the first requirement; optional WebGPU is not a prerequisite.

## Delivery evidence

1. Lead records exact candidate revision/source fingerprint, portable asset manifest and remaining parity gaps.
2. Real browser fight: six actions and timing, enemy damage/tells, collision/masks, grip/motion, death/retry, touch plus keyboard/mouse, no console-breaking errors.
3. Deploy supplies immutable HTTPS preview and exact served manifest/bytes; keep reviewed Three.js rollback.
4. Physical iPhone Safari and Android Chrome: cold and warm time-to-playable, representative10-minute frame pacing/FPS/crashes, simultaneous touch, audio gesture, rotation/focus/resume. Target60FPS; investigate sustained<30. Measure on named devices/network/cache conditions; emulation is not phone evidence.
5. Dom judges readability and combat feel. Keep missing device/feel evidence explicit; it does not block making a testable candidate.

No backend/accounts/networking/MMO/PvP, loot system expansion, monetisation, Electron/Steam packaging or native mobile shell in this migration. F2P and longer-term AI-faction story remain; implementation scope is the existing starting game. After two failed repairs of one defect, identify its first broken stage and use a bounded alternative. Deliver playable checkpoints instead of endless feasibility work.

## Owner compute reaffirmation — 2026-10-03

Dom explicitly authorises existing Hugging Face/Blender/Three.js tooling and the
approved32GB CPU/$0.03-hour workflow for suitable migration jobs when the Mac is
slow. Lead schedules one owner for heavy exports/conversion/asset processing;
use remote CPU where supported, with verified current hardware/rate, bounded
runtime, retained/downloaded outputs and stopped completed workers. Avoid local/
remote duplicate jobs, unnecessary cloud launches and GPU/new-tier spend.
Light local work can continue; real phone/browser GPU and interaction evidence
must still come from target devices. No remote Unity licensing dependency.
