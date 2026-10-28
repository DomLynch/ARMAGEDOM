# Area 8 arrival road: pile painted out

Problem (Dom's phone screenshot): right after arriving from Westminster, a czech hedgehog, sandbags and rubble sit on the open road at about
(0.27-0.37, 0.62-0.78) of the backdrop and look like a blocker. Collision was already fine (2.82 m clear), so the fix is the picture only.

- File: `Web/public/world/area8/backdrop-phone.webp` (the only Area 8 picture the game loads; `backdrop.png` is not referenced at runtime and is untouched).
- Rollback: `original/backdrop-phone.webp` (sha256 51bbc501560cf56f8e31fccf9612fbb5a3d362645c6f67594f841cac9b05ffdc, 542196 bytes). Copy it back and revert the three pins below.
- Result: sha256 b431d868d6e0d06bb9dbf6dd0110f50c1d7b7d407ea2306ba3f6ce5ac2999ef2, 545776 bytes, same 1672x941, lossy WebP quality 93 (one re-encode).
- Tool: `clear_road.py` (CPU only: numpy, OpenCV, Pillow, run on the Mac), inputs `mask-area8-pile.json` (hand-drawn polygon, full-image px), `src-area8-pile.json` (clean road rectangles).
  Env used: `CLEAR_GAIN=1.3 CLEAR_STD=18 CLEAR_PALE=135 CLEAR_PALE_SHARE=0.008`.
  Low frequencies (colour and light) come from the road around the hole; high frequencies (cobble texture) are quilted from clean road at about the same
  height, with markings and pale slabs excluded, then a smooth border offset joins the fill to the picture. Colour grade, size and format unchanged.
  An earlier attempt with `art/backdrop-paint-out/quilt.py` left a light halo and copied road markings and was dropped.
- No sandbags were added back: the road edge already carries the rubble run and the kerb, and the cleaner road reads better.
- Pins re-done with this reason (backdrop bytes changed): `Web/src/data/areas.json` (`backdrop.area8` sha256 and bytes), `Web/public/world/manifest.json`
  (area8 backdrop row), `Web/tests/data-areas.test.js` (areas.json file hash). Collision, layout and depth data untouched.
- Stills (375x812, Playwright fake clock, `?qa=1&world=0`, Mac Apple GPU headless, `area8-still.mjs`): `stills/{before,after}-{arrival,near,beside}.png`,
  `stills/compare-*.png`, backdrop crop `stills/crop-before-after.png`.
- Survey of other areas: `stills/survey-south-*.png`.
