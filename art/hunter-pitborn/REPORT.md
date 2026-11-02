# Marked hunter wears the Pitborn: Art lane review and consolidation (27 Oct 2026)

Base: PR #383 (`art/pitborn-hunter`, Lead's agent: the Pitborn drawn from V3's cut GLB, data rows). This lane added two commits on it. The earlier standalone PR #382 (`art/hunter-pitborn`) is closed with a pointer. Draft, not merged; ships only after Dom's stills and phone test.

## What this lane added on top of #383

1. **Commit `b8b79fe6`, additions only:** the manifest rows `upperBone` (`mixamorig:Spine`) and `headBone` (`mixamorig:Head`), and the two one-line reads that use them (`donor-motion.js` for the guard overlay's upper-body bone, `engine/boss-label.js` for the HUNTER label). Both default to the old names, so no other model changes. Without `headBone` the HUNTER label disappears above a 106-rig body (seen in game).
2. **Commit `47cf51d4`, droppable on its own:** the plain web body with the cleaver baked into the hand replaces the cut GLB (same file name, same `scale` 0.95 and `stride` 0.964 from #383). Reasons, all measured:

| | cut GLB (#383 as opened) | web body + cleaver |
|---|---|---|
| bytes | 2,407,576 | 1,211,976 |
| meshes | 24 (8 `piece_*` plus 16 `cap_*`, caps hidden by `starterHidden`) | 4 |
| weapon | none (hands empty in every clip) | Pitborn cleaver on `fk_socket_hand_r` as `WeaponDrawn` |
| seams | faint cut lines at thighs and waist in the viewer stills | none |

   Built by `build-hunter.mjs` (gltf-transform, CPU) from OpenTrident `minotaur-106-v3-web.glb` (the body V3's cut GLB is made from): skeleton, bind pose and the 16 hunter clips untouched; `Layer_*` gear nodes dropped; no cut pieces, physics or special clips. The cut GLB stays in history at `a12f6504` and in `provenance.cutGlbAlternative`. The appearance test is re-pinned (no cut pieces, cleaver in the socket).

## Answers to the known gaps listed on #383

| gap | status |
|---|---|
| no weapon mounted (`equipDonorPlayer` hard-codes `hand_r`) | **fixed in the asset**: the cleaver is baked under `fk_socket_hand_r`, so `equipDonorPlayer` is not needed for the hunter (that path only runs when the manifest row has an `equipment` entry, which this row does not) |
| donor-motion looks for `spine_01` (guard overlay) | **fixed**: `upperBone` row |
| no `rigCapabilities` row | **left as is, on purpose**: it stays inert while `entity.rig` is `hollow-scavenger` (the hunter keeps its mechanical rig); nothing reads a row for `pitborn-106` |
| nothing rendered or phone-tested | **rendered**: in-game and viewer stills below; **phone-tested: no**, that is Dom's gate |
| HUNTER label gone above the model (found by this lane) | **fixed**: `headBone` row |

## Stills (375 px, 3x), `stills/`

Viewer, goblin hunter left, Pitborn right at `scale` 0.95, same clip and time: `viewer-cut-*` (#383 as opened, caps hidden) and `viewer-web-*` (this lane's body): idle (Armed), run, attack, death. In game, Westminster, the hunter held still 3.6 m up-right of the player: `game-before-goblin-hunter-crop`, `game-after-*`.

Findings on the checklist: no pink or flesh patches at shoulders, belt or neck with the caps hidden (cut GLB) and none on the web body; empty right hand on the cut GLB in every clip, cleaver in hand on the web body; faint seam lines on the cut GLB only; the Pitborn is taller than the goblin (1.54 m against 1.25 m in the Armed pose, then x0.95); foot slide and head height against roofs are **not measured**.

## Numbers against the current goblin hunter (70,542 triangles, 2,861,704 bytes)

Web body: 48,257 triangles, 1,211,976 bytes, 106 joints in one skin, 16 clips with durations identical to the goblin's (so everything the code ties to a clip is unchanged), mixer plus skeleton CPU for 24 instances running Run 0.37 ms per frame against 0.66-0.72 (Mac, headless, no GPU draw; not a phone).

## Not verified

Physical phone (look, pacing, deferred load), a live fight (attack, hit, guard, death), foot slide at stride 0.964, head height against roofs, other areas' lighting; the full `verify_web` gate was run by #383's author on its own head, not on these two commits (the subset below was).

## Rollback

Drop `47cf51d4` to return to the cut GLB; revert the PR to return to the goblin hunter.
