# South arrival road (from Elephant and Castle): pile painted out

Same method as `art/area8-clear-road` (PR #410): `clear_road.py` (CPU: numpy, OpenCV, Pillow) fills a hand-drawn mask with the colour/light of the surrounding road
(low frequency) plus cobble texture quilted from clean road at about the same height (high frequency), then a smooth border offset. This copy adds
`CLEAR_FEATHER` (fade the fill out over 24 px inside a larger mask so no hard edge or lighter band shows) and `CLEAR_BAND`.

- Removed: sandbag stack, barrel and ammo crates at about (0.58-0.66, 0.60-0.72) of the South phone backdrop (arrival point (0.70, 0.79)). Mask `mask-south-pile.json`, source rects `src-south-pile.json` (full-image px).
- Env: `CLEAR_QUALITY=90 CLEAR_DILATE=29 CLEAR_FEATHER=24 CLEAR_SEED=11 CLEAR_BAND=200 CLEAR_GAIN=1.5 CLEAR_STD=16 CLEAR_PALE=105 CLEAR_PALE_SHARE=0.01 CLEAR_GUARD=15`.
- File: `Web/public/world/south/backdrop-phone.webp`, 1672x941 lossy WebP q90. Before: sha256 f58ff4bbb15e41bb7feb1878439462290ac98038d9e252b2cf6833f3e59c215e, 446406 bytes (kept in `original/`, the rollback). After: sha256 a83e27eba53ea0df7b619b99f34d550e7926bf3c20b28aef551ac39c5ac21966, 458994 bytes.
- Pins re-done (backdrop bytes changed on purpose): `Web/src/data/areas.json` (`backdrop.south`), `Web/public/world/manifest.json` (south backdrop row), `Web/tests/data-areas.test.js` (areas.json file hash). Collision/layout untouched. The Lambeth crate stack and the bottom-edge hedgehog are left alone.
- Stills: `south-still.mjs` (Playwright fake clock, `?qa=1&world=0`, Mac GPU headless, `world.loadArea("south", {0.70, 0.788})`); `stills/compare-{arrival,near,beside}.png`, `stills/crop-before-after.png`.
