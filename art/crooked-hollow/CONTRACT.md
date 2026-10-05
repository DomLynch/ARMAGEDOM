# Crooked Hollow API — 2026-10-05

Isolated worktrees/crooked-hollow, codex/armagedom-crooked-hollow, accepted02779f88419. NEW Web/src/crooked-hollow.js/test and art/crooked-hollow evidence only. No existing actors/donor-motion/combat edits.

Chosen reversible overlay rather than cloned gait tracks: native-sampled leg poses can be shortened while preserving evaluated floor targets, and dangling arms can be aimed against gravity rather than arbitrary local arm rest axes. Cloned tracks alone would need baking foot constraints into each gait. Entire source clips/model remain original, no GLB export/new geometry. Choice requires one wrapper allocation for selected private actor clones:

```js
const native=new DonorMotion(root,model,animations,description);
view.motion = selectedCrooked ? new CrookedHollowMotion(native) : native;
```

Wrapper implements update/sample/dispose and read-only currentClip/currentPhase. All original descriptions/animations/contact paths unchanged. Restores its cached prior bone transforms BEFORE every native sample, then overlays only HollowIdle/HollowWalk/Run/StrafeLeft/StrafeRight; skips guard/swing/roll/hurt/death. Native attack/reaction clips must not be renamed to a gait. Deep spinal fold/uneven clavicles/lowered head, gravity-directed arms, shorter left/right foot travel and uneven support phase. Movement/root/AI/collision speeds stay original. Existing placementKey subset remains WebUI's decision. Final same-rig side/London comparison and seven focused checks passed; see HANDOFF.md. Integrated normal-play review remains WebUI/Lead acceptance.
