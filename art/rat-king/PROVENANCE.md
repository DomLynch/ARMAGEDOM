# Rat King: scarred rats with knotted tails (28 Oct 2026)

Dom's ruling (28 Oct): realistic, grounded, no glowing eyes, no crown, horns or runes, believable scale, not a boss. A real rat king is rats whose tails are knotted together; that is what this is. The first draft (crown of bone spikes, spine ridge, red eyes, 3x scale) was thrown away; a second pass (this one) darkened the fur, added bare scarred patches and made the tail knot clear.

Pipeline, all CPU on the VPS (`/srv/dev-jobs/art-rat-king/`, no GPU, no paid service): `run.sh` runs `coat.py` (Pillow/numpy), `build.py` (Blender 5.2.2 headless), `gltf-transform meshopt --level medium`, then `anim_cmp.py` and Workbench stills (`render.py`). In-game stills: `king-still.mjs` (Playwright, fake clock, `?qa=1&world=0`) against a throwaway QA build whose world manifest starts in area7 (`qa-initial-area.py`, never committed).

- Source: `Web/public/assets/rat/original-rat.glb`, sha256 `0644f2fba2c3fabb9afcdf35845e582dc0b94a1e5060502cfdcd246caf8ab558` (419,172 bytes). Unchanged.
- Output: `Web/public/assets/rat/rat-king.glb`, 233,120 bytes, sha256 `88a9452fa84c9d94327ea7cecd8097527362c1d2466f52c0f42793405a77158c` (pinned in `manifest-hollow.json` as model `rat-king`).
- Rig kept: `ARM_RatRig`, all 24 bones, all 7 clips (`rat_idle/walk/run/hit/death/bite/bite_low`), one skinned mesh, the same four materials and names (`Ash and soot worn fur` is guarded by `animal-appearance.js`). Motion kind `rat`, rig `original-rat`: no new movement, bite, hit or death code.
- Mesh: the original 2,701 vertices and 4,602 triangles keep their indices and positions. Added: six low-poly rats (body, head, snout, small dark ears, normal dark eyes, tail) fused on the back and flanks; each tail runs to one knot off the right flank where all six twist together into a rope that rises and droops, with a lump of scar tissue at the knot; five thin scar welts. Every new vertex copies the skin weights of the nearest original vertex (no new bones). No spikes, crown, ridge or glow.
- Size: 7,590 triangles, 4,324 vertices (budget about 8k), GLB 233,120 bytes (budget about 600 KB), coat texture 512 WebP.
- Look: dark brown-grey fur; blotchy vertex colour (darker and lighter fur plus patches of bare scarred skin, by position noise) on the original body and the added rats; per-rat tint variation; dark ears and tails; dark eyes. `coat.py` regrades the original coat texture (dark umber, hair streaks).
- Clip timing: built at 30 fps so every clip lands on a whole frame; `anim_cmp.py` shows all seven durations equal to the source; 24 joints equal.
- Scale: manifest `scale` 6 (the plain rat is 3): twice a rat. Collision radius, reach, bite and health (20) are the rat's.
- Slot: Area 7, cycle A of `area7-station-rat-v1` (was rat-soot); cycle B untouched. The slot's cycle spec carries `appearanceRef: "rat-king"`.

Stills (`stills/`): `game-375-idle.png`, `game-375-fight.png` (375x812 at device pixel ratio 2, game camera, open road, a few metres from the player), `model-q34.png`, `model-back.png` (Workbench renders, which ignore vertex colours).

Not checked: a physical phone (loading, frame pacing, feel), audio, concurrent touch.
