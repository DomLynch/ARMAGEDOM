> Historical engine reference only — 2026-10-04: Unity is retired; Game/ and engine commands are privately archived and must not be reactivated. Consult canonical AGENTS.md and briefs/THREEJS-ONLY-RETIREMENT.md for active Three.js work.

# Original combat roster — 2026-10-02

The same room now shows three distinct enemy meshes in its first wave:
Ash Revenant (sword melee), Orc Executioner (heavy axe), Plague Warlock (ranged
caster with brass crozier). The final Orc Warlord scales the orc mesh; it is not
a fourth unique enemy asset. The original Warden remains the playable hero.

## Sources and cost

The orc and warlock are original built-in image generations, reconstructed using
the official TRELLIS.2 demo at 1536 geometry resolution and 4096px textures.
References, source GLBs, rigged Blender files and individual generation/quota
receipts live in `orc/` and `warlock/`. The orc has 94,673 source triangles; the warlock has 99,572.
Both requests target 100K triangles; actual counts are in each rig-report.json.
Included quota decreased from 2158.179116 to 1967.66119 seconds. Before/after
overquotaUsed remained zero. No paid assets, GPU Jobs or other compute purchases.
CPU rigging and FBX conversion ran locally using four Blender threads.

## Reproduce

From the repo root, for each name/path pair Orc/orc and Warlock/warlock:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 4 --python art/hero/rig_warden.py -- --name Orc --folder Enemies --source art/enemies/orc/orc-source.glb
```

Refresh Unity, then call `Ashvault.Editor.HeroImport.SetupRoster()` using the
Unity CLI. The importer only touches each character's matching textures, keeps
4K albedo and explicit PBR remaps, and assigns legacy idle/run/attack clips.
Weapons are original geometry rigidly bound to the hand. Each character's body
and weapon are separate skinned renderers. Colliders remain on gameplay roots.

## Changes and verification

- Different per-mesh arm and leg fits, continuous four-bone skin influences.
- Knee bends corrected during the forward stride; reduced exaggerated leg lift.
- Warden's duplicate gameplay bounce removed, closer default camera, subtle
  cool directional fill and less mirror-like weapon steel.
- Warlock casting uses its free arm while retaining the staff grip.
- First wave test verifies all three kinds use their own imported model.
- All four characters sampled in Idle/Run/Attack at three times per clip.
  The expanded check caught an old Warden underarm stretch of 0.3186m. Replacing
  hard region weights fixed it; the unchanged 0.2m limit now passes, 11/11 tests.
- Feet minimum world Y verified near zero for all four idle models. Imported
  idle and attack poses visually reviewed in the existing room.

Lighting trial screenshots in artifacts are art-review views; the final native
capture and build receipt establish the delivered appearance. One cache-corrupt
build reported TypeDB duplicate registration despite Succeeded; it is not an
accepted delivery. Its cache was preserved before a fresh-cache rebuild.

## Limits

These are original reconstructed prototype models, not a certified AAA result.
Source texture detail is better than final geometry in faces/hands. Weapons and
procedural animation remain less detailed than the reconstructed armour. Micro
normals derive from albedo, not a sculpt bake. Full difficulty, sustained combat
FPS and Windows are separate acceptance. Do not repeat remote inference to fix
local weights, materials, or import settings.

## Final delivery receipt

Build `build_f3d1672493fa` succeeded with zero errors, 443,151,318 bytes; native
startup smoke passed. Screenshot `artifacts/roster-native.png` shows the final app
with all three designs in wave one. Native attack cooldowns, incoming damage, death
and restart observed; no native kill/full-clear claim for this pass. Real PlayMode
combat/progression suite passes 11/11. App reset to safe entrance.
