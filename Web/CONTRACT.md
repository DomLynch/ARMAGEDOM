# Browser client boundaries — 2026-10-04

Plain ES modules, pinned Three.js and Vite; Node tests. Lead owns integration,
package/lock and main loop; Combat mechanics; WebUI HUD/input; World registered
geometry/data/occlusion/audio; Characters portable actors/weapons/manifest;
Deploy exact dist publication; Backend isolated optional account/private save.
One owner per deliverable, bounded pinned handoffs. No legacy engine runtime.

Domain positions {x,z} use the existing registered London metre convention.
Rendering converts to (x,y,-z); facing uses domain x,z. GLTF local forward +Z,
actor yaw atan2(facing.x,-facing.z) plus explicit forwardCorrection. Keep each
source rig/feet origin/body scale, never silently normalise opponents.
Selected006 actor visual multiplier1.3225, common world characterScale1.265,
cameraScale1.3365, sceneZoom1; map unchanged. Gameplay radii/reach remain distinct.

World createWorld({THREE,renderer,scene,camera,baseUrl}) returns spawn, move,
lineClear, screenToGround, update, toRender and dispose; collision is in domain
metres. Painting, actors and occlusion use one registered crop. Current data under
public/world/westminster/. Existing south/east continuity requires actual served
crossing proof; planning is not acceptance. Saved layout controls framing.

Selected donor manifest public/assets/donor/manifest.json pins player/opponent/
weapon URLs, source scales, clips and provenance. SkeletonUtils clones each rig,
separate mixers, original bones/grip/motion preserved. Weapon timing/contact and
visual motion need fight-camera evidence, not structural hashes alone. Original
portable art and immutable package provenance remain intact.

Current stamina008:100 maximum, Slash18/Stab14/Heavy26/Special40/Dodge30;
regen40/s after0.75s, guarding halves recovery, exhaustion latch20. Directional
front guard does not protect rear/side hits. Six actions and desktop controls
remain. Rotation/menu/focus cancel held and buffered input. Player-gesture audio.

Publication/current receipt, browser fight and physical-phone concurrent touch/
audio/cold-load/frame pacing/feel are separate gates. No all100-rank preload,
placeholder roster, wholesale donor app or archived-engine fallback.
