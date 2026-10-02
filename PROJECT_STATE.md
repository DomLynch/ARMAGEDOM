# Ashvault — 2026-10-02

## Objective and scope
Local single-room isometric ARPG, three waves, melee, dodge, upgrades and an orc
warlord. Unity 6000.3.25f1 Built-in renderer; native Mac `Builds/Ashvault.app`.
Ten runtime scripts; no backend/networking. No purchased assets or paid cloud GPU.

## Current implementation
One playable Warden plus Revenant, Orc Executioner and Plague Warlock enemy models.
Original 4K PBR maps, CPU rigs, original sword/axe/crozier. First wave shows all
three enemy types; waves contain 5, 6 and 1 foes. Existing room preserved.
WASD moves, LMB slashes/holds to repeat, Q/RMB heavy, 1 shockwave, Space dodge,
R restart, V inspection, scroll zoom. No click travel. Hero turns through 360 degrees.
Player and enemy attack cones/floor outlines removed; enemy animation signals wind-up.
Distance-matched run playback and two-bone stance contacts; strike damage lands after
anticipation, with planted feet and recovery. Dodge cancels pending strike damage.

## Compute
Original reference reconstruction used official TRELLIS.2 shared demo; overage zero.
Initial rigging/conversion local CPU. Latest motion bake used authenticated HF Pro
CPU Upgrade, 8 vCPU/32 GB at $0.03/hour, 15-minute limit, private input/output repo.
Job `6abfb00b404719ba37622f1a` completed and all four rigs integrated. No rented GPU.
Unity now operates in persistent local batch mode with Metal, without desktop Editor.
Receipts/reproduction: `art/hero/motion-notes.md`, `art/enemies/roster.md`.

## Verified evidence
- 13/13 real PlayMode tests pass, including controls, attack timing, dodge cancellation,
  foot contacts, unchanged 0.2m deformation limit, materials, progression and restart.
  Enemy timing test also confirms no floor outlines during wind-up or impact.
- Latest Mac build `build_1ad04f9ab460`: Succeeded, zero errors, 443,255,510 bytes.
  One expected warning: remote Pipeline runtime disabled in packaged app.
- Latest packaged startup smoke passed. Native new build shows enemy attacks and
  incoming damage without red floor outlines, plus the updated death hint.
  Receipt: `artifacts/no-cones-native.png`; native full clear was not verified.
- Reusable skill `unity-blender-cpu-art/references/original-hero.md` updated with
  motion, CPU cloud dependencies/private IO, input isolation and validation learnings.

## Closed failures
Previous 8/11 input tests failed with physical desktop/focus interference. Scoped
input-device/focus isolation passed the original unchanged 11 tests before controls
changed. Latest suite has 13 tests; no thresholds relaxed.
A later click test measured vertical spawn settling (-0.26 to +0.04 Y) as travel;
X/Z unchanged. Syncing colliders and settling the capsule before recording the input
baseline fixed the fixture; same 0.03m 3D limit remains and full 13/13 suite passed.
HF first motion job lacked libXfixes; dependency-installed retry completed the same
bake/validate/upload workflow. Earlier duplicate TypeDB build errors were fixed by a
fresh Library; always check error count even when build says Succeeded.
Workspace deployment lock briefly blocked tests; it subsequently allowed the full suite/build.

## Open acceptance
User reports walking still looks fake. Natural motion is NOT accepted as complete:
review continuous weight transfer, hips/shoulders and start-stop transitions next.
Passing mechanics tests is not proof of natural animation or AAA quality.
Hands/grip, simple weapons, facial detail and world presentation remain prototype
limits. Native full clear, human difficulty/pacing, sustained FPS and Windows unverified.
No Git remote/deployment target. Preserve unrelated Blender copies, old caches,
review captures and TimeManager migration outside scoped commits.
