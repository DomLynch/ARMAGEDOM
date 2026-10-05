# Combat18 attachment guidance — Characters, 2026-10-05

Read-only accepted044 source inspection, exact revision `f4109869b4169d82be1a385ed110ee4e68291309`. Source hashes in SOURCE.json. This is attachment guidance for WebUI, not an implementation, integration or phone-feel receipt. Custom bullet-lethal-presentation work remains queued behind the prototype impact port; no candidate module, burst pool, worktree or capture job was created.

## Pistol: use the existing whole-weapon recoil

Actual committed pistol GLB SHA256 `62d6bdc4789365ace89c98bc3fe74322ae427f316810f81cb4ad66857e73f321`, 106436 bytes. Four nodes: Pistol root, Grip, Muzzle, PistolMesh. One static mesh with three material primitives; no slide node, skin or animation. A material primitive is not a movable slide. Do not detach an assumed slide, replace geometry or launch asset generation for this port.

Existing attachPistol creates PistolMount under the private character model, and adds a cloned pistol scene. It is deliberately model-parented, not hand-parented: applyPistolAim solves the existing upperarm_r/lowerarm_r/hand_r pose, then writes the mount transform from the sampled hand in model space. Keep that parenting and call order; hand parenting would apply the hand transform again. Existing recoil clamps its input to 0–1 and applies up to 0.10 radians of weapon pitch. Feed the accepted shot-response envelope through this existing parameter once. Do not layer another independent mount rotation on top of it. Position/amplitude fidelity needs the integration camera proof, not these header checks.

Muzzle local position is [0, 0.055, 0.161], barrel +Z, up +Y. Resolve mount.getObjectByName('Muzzle').getWorldPosition only after motion sampling and applyPistolAim, rather than using the model/root origin as the muzzle. The existing actor scale already applies to the mount. Use world-space muzzle coordinates for the shared effect pool; do not multiply the actor scale twice. Keep mount hidden and skip the overlay during melee, dodge, hurt and death as existing actors.js does.

## Victim: compose at the existing visual root

Current actors.js resets view.root from world.toRender(entity.pos) and authoritative facing each update. DonorMotion samples the model below that root. Existing finisher owns the selected native Hit then Death clip and its age; during Hit it also returns a bounded 0.1m direction offset. After sampling, actors applies deathPose.offset to the visual root once. Logical entity.pos and separately positioned shadow remain authoritative.

Smallest compatible seam: WebUI composes donor impact feedback with this existing victim presentation in actors.js, then applies one final visual transform. Do not add another independently advancing lethal presenter/root offset, reparent the skinned rig under a second animated pivot, or reset the sampled bone rotations after motion. For a selected pistol-directional lethal reaction, reuse the existing native Hit/Death clock and choose/combine the donor flinch in that one composer; avoid counting the current 0.1m flinch twice. Preserve complete native finisher playback during presentation holds. Rebuild baseline root position/yaw each frame before applying the transient effect; return exactly to baseline when it decays or FX resets.

ARM-domain direction (x,z) maps to render (x,-z) once. Existing deathPose.offset remains ARM-domain: current integration adds offset.x and subtracts offset.z. Root scale already contains character1.265, visual1.3225 and mob size; a world-space root displacement must not multiply that scale again. Reuse registered obstacle checks for any new displacement. Refresh root.updateMatrixWorld(true) after composition; keep SkinnedMesh bind matrices/skeleton sampling compatible with the existing rig.

For pooled victim particles resolve a native bone/world anchor after the composed pose; bone location alone does not establish measured hit anatomy. Actor-local attachment may follow the native bone, but unknown hitRegion stays unknown. Use the existing confirmed event identity and one impact owner. Restored corpse views are already identified by view.restoredCorpse: do not replay fresh burst/audio on area return. Actor removal/Retry resets effect state before releasing face/rig resources.

## Verification and scope

Observed: exact committed GLB node/mesh/animation metadata and current source call order/lifecycle. No existing runtime or asset changed. No tests/builds/browser/Blender/HF/VPS jobs were required for this read-only guidance. Existing art receipts were reused only as context; no new visual, served or physical-device acceptance claim. Integration must prove normal006 recoil/flinch in High/Low/Off, wall depth, continuing gameplay/native death clocks, reset/disposal and actual phone feel.
