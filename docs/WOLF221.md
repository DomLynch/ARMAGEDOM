# East wolf221

Replaces only `east-roamer-8` at its unchanged home/patrol, in both cycles.
East retains six hostiles, Hale120 and the existing East4 creature slot. South,
its watcher, Reaper, Nightborn and every other encounter remain unchanged.

The seventh foundation is `original-wolf`: original31-bone skin and seven native
clips, copied byte-for-byte from RPG-game pinned3f7dd261/public/world/wolf.glb.
SHA2565390a72819ada693cad7ca3c4c5788b3d9d9357d48b17ad823d018e86b30becc.
Descriptor1, existing1.6729625 actor wrapper, own floor+.00349070777 native.
Body radius.26 follows measured width.482916m; mouth reach is separate.
HP40, speed2.6, wake4/home leash5; Bite8 damage/8 stamina,20/12/24ticks.
No fire, retargeting, custom spawn framework, DTO or save schema change.

Bite uses actual posed wolf surface vertex3145, transformed once to world space,
and the existing full skinned lower-leg receiver. This is one mouth surface,
not paired canine anatomy. Its measured lateral offset.09998m requires a root
facing correction. Actual active sweep calibration selected.95m mouth standoff;
initial.90m overshot the calf before reaching its height. Native windup freezes
its direction, so ordinary walking/retreat can avoid it. Damage remains an exact
surface sweep, never proximity or capsule substitution.

Knife and Cleaver reuse RatLowSlash for this smaller body; the old DogMidSlash
passed above it. Bone Saw selects that existing low pose only for the nearest
legal Wolf in its original cone/range/LOS. The same DonorMotion sampling drives
rendered blade and exact-mesh contact; Human saw pose/cost/cadence are retained.
Aim cue, tracer, hit confirmation and burst use measured.65m world height.

Focused actual-rig checks cover Bite hit/retreat miss, walls, native responses,
Knife kill, Bone Saw contact and cleanup. Actual220 Core fixtures cover alive
replacement, old death suppression and a221 Knife-killed save read by220.
Browser/package and publication receipts are separate; physical phone/Safari/FPS
remain unverified unless an explicit later receipt establishes them.
