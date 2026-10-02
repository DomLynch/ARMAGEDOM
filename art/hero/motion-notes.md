# Motion and trackpad controls — 2026-10-02

The user rated the art 6.5/10 and requested natural feet/arms/strikes, WASD travel
and left-click attacks. Preserve the character meshes, textures and existing room.

## Implemented

- `refine_motion.py` opens the existing original rigs with embedded scripts disabled.
  Two-bone leg solving follows a constant-speed stance trajectory and lifted return.
  Hips move in the correct rest-bone coordinate system; soles retain their orientation.
- Each full cycle represents 2.375m. ArtMotion scales playback using actual horizontal
  displacement and character scale; blocked movement stops the run animation.
- Strike has anticipation, contact at normalized phase 0.45, follow-through and recovery.
  Runtime maps this to gameplay wind-up/recovery. Damage no longer lands at button press.
- WASD moves at 4.2m/s. LMB slashes/holds to repeat; Q or RMB performs a heavy attack.
  Clicking never creates a movement destination. Feet remain planted during strikes.
  Dodge cancels both pending damage and the swing animation.

## Compute and receipts

Unity now runs locally in batch mode with Metal available for rendered checks, without
its desktop Editor window. Persistent command pattern is documented in the Unity CLI skill.

Hugging Face Pro account: Domlynch. Private working repository:
`Domlynch/ashvault-motion-work`. Original source rigs uploaded for the authorized job.
CPU Upgrade: 8 vCPU, 32 GB, $0.03/hour; timeout 15 minutes per job. No rented GPU.
First job `6abfafb1404719ba37622edd` failed on missing libXfixes.so.3 before baking.
Retry `6abfb00b404719ba37622f1a` installed Blender's Linux shared-library dependencies,
then baked all four rigs, validated stance trajectories, uploaded outputs and completed.
Downloaded FBXs and Blender source files are the integrated cloud results.
`artifacts/cloud-motion-job.json` and `cloud-motion-validation.json` contain receipts.

Bpy 5.2.2 requires system libraries even for CPU/headless work: libxfixes3, libxi6,
libxrender1, libxkbcommon0, libsm6, libgl1 and libxrandr2. These are shared libraries,
not a rented GPU. Pin Python/bpy versions and cap the job. Keep tokens in secrets.

## Gate failure closure

A stop gate on the preceding build passed 8/11: physical desktop device events/focus
interfered with synthetic mouse/keyboard tests. Isolating enabled desktop devices and
scoping/restoring input focus settings made the original, unchanged behavioral suite
pass 11/11 (`artifacts/input-isolation-pass.json`) before changing input behavior.
An InputTestFixture trial produced package cached-value diagnostics on same-update
press/release; rejected rather than suppressing error logs or loosening assertions.

New tests reflect the explicitly changed controls: rapid click starts a slash without
travel, held slash kills in range without approaching, WASD/diagonal motion remains
bounded, damage waits for contact, dodge cancels pending damage, all four imported
rigs hold stance and clear the swing foot. The existing 0.2m deformation gate remains.
Computing the same maximum across every edge before asserting removes millions of
redundant NUnit calls; it does not skip geometry or change the threshold.
13/13 passed headlessly after the final code change.

## Review checkpoint

Motion build `build_09280800ff7b` succeeded with zero errors; packaged startup smoke
passed. Native HUD, Q cooldown, movement/dodge and first-wave roster observed.
User still finds walking fake: natural-motion acceptance remains open. Tests
establish mechanical contact/timing, not perfect or production-ready animation.
Next gait review must inspect continuous weight transfer and start/stop transitions.

User subsequently requested removal of enemy floor cones. Both wind-up and impact
draw calls are removed, with the death hint updated to refer to enemy wind-up.
The existing timing test retains damage assertions and also rejects floor outlines.
The workspace deployment lock temporarily blocked verification, then allowed it.
13/13 passed with cone-removal assertions. No quality threshold was weakened.
One click test initially measured vertical spawn settling from Y=-0.26 to Y=0.04
as movement, while X/Z stayed fixed. Synchronizing floor colliders and letting the
capsule settle before recording the baseline fixed the fixture; its same 0.03m
three-dimensional movement limit remains. Build `build_1ad04f9ab460` succeeded
with zero errors, standalone smoke passed, and native combat/incoming damage
without enemy outlines was observed. Screenshot: `artifacts/no-cones-native.png`.

## Limits

Foot-bone contact is an automated skeletal check, not proof of perfect deformed-sole
contact in every frame. Animation remains authored/procedural rather than motion capture.
Hands, weapon grip, terrain adaptation and transition polish remain prototype limits.
Human feel/difficulty and sustained native FPS still require a longer play session.
The run pilot image and strike image are Unity render checks, not concept images.

## Primary documentation

- https://docs.unity.com/en-us/engine/6000.3/manual/unity-editor/command-line-arguments/editor
- https://huggingface.co/docs/hub/main/en/jobs-pricing
- https://docs.unity3d.com/Packages/com.unity.inputsystem@1.4/api/UnityEngine.InputSystem.InputSettings.html
