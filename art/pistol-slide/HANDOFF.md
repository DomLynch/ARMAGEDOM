# Existing pistol slide assembly — Characters, 2026-10-05

Isolated new component from accepted044 `f4109869b4169d82be1a385ed110ee4e68291309`. Only integrate Web/src/pistol-slide.js and its focused test; existing runtime, original pistol GLB, finisher, face/rig and other lanes untouched. Exact files/hashes in SOURCE.json. WebUI owns integration; Lead owns acceptance. Custom bullet injury presenter remains held; this adds no victim presenter or particle pool.

## What actually separates

Source GLB is unchanged, SHA256 `62d6bdc4789365ace89c98bc3fe74322ae427f316810f81cb4ad66857e73f321`. Its authoring script joins the named Slide, serrations, sights, muzzle face, grip/frame/ribs/trigger into one GLB mesh. The actual Three0.182 GLTFLoader represents that mesh as PistolMesh GROUP plus three material Mesh children, not one indexed Mesh with groups. Read-only topology inspection identified31 disconnected bevelled-box islands, each44 triangles, by welding positional duplicates within each primitive (normals/UV seams remain intact).

The helper selects fourteen whole, bounds-matched islands: slide1 + serrations10 + sights2 + muzzle face1. It moves616 triangles as the existing upper assembly;748 frame/grip/trigger/rib triangles remain stationary. Selection is geometric, not material-as-slide: WornSteel grip ribs and trigger guard remain fixed. The existing muzzle face is part of the moving upper assembly so it stays attached to the slide front. This simplified authored weapon has no independent barrel, bore or internal mechanism; none is fabricated. Grip and Muzzle marker nodes remain unchanged. Muzzle represents the rest-position shot origin, as before; feed shot flash from that marker at the event seam, not from a displaced slide corner.

## Small integration contract

```js
import {attachPistolSlide} from './pistol-slide.js';
// Once per private actor, AFTER its material clone pass:
view.pistolSlide = attachPistolSlide(view.pistolMount);
// Each presentation update, use the SAME accepted shot recoil envelope:
view.pistolSlide.setRecoil(pistolVisible ? pistolRecoil : 0);
// FX reset/menu/Retry or weapon switch:
view.pistolSlide.reset();
// Actor removal, BEFORE actor material/rig/source cleanup:
view.pistolSlide.dispose();
```

Do not call attach before actors.js material cloning: slide parts borrow the two corresponding private actor materials. Continue applyPistolAim for arm/whole-weapon recoil. This helper only translates the upper assembly along local -Z by at most0.012m, multiplied naturally by the existing actor scale. It does not independently advance a clock, change aiming/bones/weapon grips, or emit effects. Input is a finite0–1 presentation envelope; other values clamp/reset. Use existing FX mode semantics for slide amplitude and hide/reset gates; do not make High/Low/Off or reduced-motion a second settings system here.

Return is {supported,slide,triangles,setRecoil,reset,dispose}; unsupported assets return a no-op handle with reason. Missing/changed topology or repeated attach falls back to existing whole-weapon recoil. No runtime edits needed from Characters. The new PistolSlide group is a child of the original PistolMesh container; do not reparent PistolMount to hand_r or move Muzzle/Grip.

## Ownership and budget

Four owned BufferGeometries clone attributes as well as indices during prepare, so disposing this helper cannot free source geometry buffers. Two static source primitive geometries are temporarily replaced by owned triangle subsets; dispose restores exact original references and removes the two moving Mesh children. CharcoalGrip primitive stays untouched. Borrow materials/textures, no clones or disposal of them; dispose owns only its four geometries, exactly once. No geometry allocation during shots or reset. No lights, texture, dependency, generator, Blender, HF or heavy capture job. Original total1364 triangles stays1364; main-pass mesh count3→5 (+2 draws estimated from scene structure, not GPU measurement).

## Evidence and remaining checks

Three focused tests PASS on actual hash-checked GLTFLoader scene/Three0.182. They verify exact triangle partition, identical normals/UV/position attributes, private attribute arrays, material identity, correct scaled/yawed backward travel, unchanged grip/Muzzle, stable geometry/index buffers across frames, clamp/reset, duplicate attachment, unsupported geometry, and12 prepare/dispose cycles restoring all borrowed geometry without disposing borrowed geometry/materials. Initial implementation/fixture failures are retained in verification.json; fixed final input hashes are pinned.

Source/lifecycle acceptance only. Normal006 rendered slide motion, High/Low/Off integration, shot timing, wall depth, full native gameplay and physical-phone feel remain WebUI/Lead's combined integration proof. No extra standalone art catalog or redundant full-suite job.
