# Survivor thrust/guard — read-only handoff, 2026-10-03

Decision: no dedicated thrust or guard clip in the current survivor prefab.
Use a small runtime cosmetic pose trial on the existing bones; Lead owns code,
action timing, damage and parry rules. This handoff does not implement or accept it.
No rig, rest, mesh, weights or original clips changed; no paid generation/Editor.

## Verified current assets

- VagrantImport.cs:68 loads exact original Warden Idle/Run/Attack, not generated
  candidate actions. Player.prefab serializes exactly those three clip references.
- Warden.fbx.meta:43 contains Idle1–60, Run61–85 and Attack86–104 source frames.
  No Stab/Thrust/Guard/Parry clip is serialized.
- Original19bone rig remains in the inspected candidate. Both weapon meshes are
  effectively100% weighted to Hand.R and parented to WardenRig. Machete82vertices,
  handle336vertices. Weight minimum0.99999988/1.0; rig-evidence.json pins inspection.
- Critical: these are skinned weapons, not a mesh Transform under a movable hand
  socket. Moving/reparenting the renderer separately risks a second transform.
  Rotate the existing Hand.R to move the hilt/blade coherently with its skin.
- No finger bones exist. Closed grip is authored static geometry; runtime wrist
  rotation cannot close fingers or fix the currently held hand surface defects.

## Eligible existing pose chain

Chest → Clavicle.R → UpperArm.R → Forearm.R → Hand.R.
Primary trial: UpperArm.R/Forearm.R/Hand.R; optional minimal Clavicle.R/Chest
support only if the first pose needs it. Preserve parents, local translations,
scales, bind matrices and lengths. Upper arm .32650m, forearm .29106m in source
rig coordinates before visual scale. Keep targets inside reachable two-bone range.
Left equivalents exist if a later modest free-hand guard pose is necessary; start
with the right arm only. These are available bones, not certified safe new angles.

The supplied heads/tails/hand-local bounds are BLENDER armature coordinates.
FBX axis conversion differs: derive the actual Unity imported arm directions and
weapon hilt→tip vector; do not paste Blender axes/Euler angles into runtime code.
Hand-local forward is not guaranteed to match actor.forward. Preserve the current
weapon skin binding; do not add a second offset to compensate an unverified axis.

## Smallest distinct pose candidates

Thrust: short rearward hilt anticipation → point aligned toward facing/aim target →
visible forward extension driven by shoulder/elbow rotations → retraction/settle.
Hand rotates the blade axis into the thrust direction while maintaining the same
hilt/grip. Keep a slight elbow bend; no joint translation/scale or full-arm stretch.
Use a locomotion/base upper-body pose for the thrust, or deliberately mask the old
slash upper-body contribution; merely replaying/renaming Attack still looks like
slash. Lead synchronizes extension/contact with its selected stab hit window.

Guard: bent elbow brings the hilt in front of upper chest; rotate the hand so the
blade rises diagonally/up beside the face with a clear silhouette and no face/torso
intersection. Hold while guarded, settle smoothly on release/parry completion.
Begin below extreme overhead shoulder poses; optional small chest turn, no root
translation. A visually raised guard does not itself implement blocking/parrying.

## Runtime insertion contract

ArtMotion.cs:71–74 samples Idle/Run/Attack then motion.Sample(). Apply the new
upper-body cosmetic offsets AFTER that sample; otherwise animation overwrites them.
Cache that frame's freshly sampled base rotations, then set base*weightedOffset
(or solve from that base) exactly once. Do not repeatedly multiply last frame's
already-offset rotation. Explicitly restore on action exit/cancel/restart/disable,
including when finished state returns early from LateUpdate. Original clips remain
unchanged. Lower-body sampling/foot planting stays intact.

ArtMotion.cs:75–90 already contains an ENEMY staff two-bone correction. It is a
pattern for fixed bone lengths, not an existing player thrust/guard. Keep the new
player-only branch scoped so enemy art and controller/collision remain unaffected.

## First visual gate (Lead's released Unity slot)

At saved London zoom1.65/scale1.265 compare slash/stab/guard from the same camera:
blade visibly extends forward for stab; guard visibly raises/holds it. Inspect
windup/contact/retraction and moving/turning, cancellation/dodge, gear on/off and
return-to-idle for shoulder folds, wrist/hilt drift, weapon/face intersection and
foot continuity. Close-up supplements the native game-camera check. Damage/parry
numbers cannot replace distinct visible poses. Dom accepts representative behavior.
Existing grip/hair/zipper limitations remain disclosed; no new accepted action yet.

Evidence: rig-evidence.json and receipt.json pin source hashes and actual binding.
CodeGraph again returned preserved Library cache symbols; focused Semble located
current Game/Assets/Scripts/ArtMotion.cs, which was read directly. Offline Blender
inspection only opened a copied candidate with use_scripts=False; no save/export.
