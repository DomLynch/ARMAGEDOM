# Lossless backdrop copies

Separate World patch: three WebP files, world.js filename selection, manifest,
focused tests and this receipt. Original PNGs retained byte-for-byte. No layout,
collision, dimensions, camera, character or painting changes.

Manifest `backdrops` maps area ID to explicit filename `backdrop.webp`.
Initial createWorld and atomic loadArea use that name, falling back to backdrop.png
for older manifests. Manifest `files` selects WebPs and accurate runtime hashes
instead of original PNGs; package only these selected runtime entries. Layout
records were rehashed too, correcting stale Westminster receipt after zoom tuning.
No original PNG removal is authorized or required.

Lossless encoder: Pillow WebP lossless=True, exact=True, method=0, sequential ~8s
light CPU total. Pillow RGBA equality verified; real Chromium151 and WebKit26.5
canvas-decode equality verified for all three1672x941 images. Desktop WebKit is
not physical iPhone acceptance. Browser check served source Web/public on8897;
first attempt used incorrect public path and404, corrected before successful run.

Westminster2,898,653→2,297,404bytes (20.74% smaller).
South3,152,685→2,569,092bytes (18.51% smaller).
East3,005,065→2,374,366bytes (20.99% smaller).
48/48 lane tests plus source syntax and diff pass. receipt.json pins output and
RGBA hashes; browser.json pins actual browser evidence. This measures backdrop
bytes, not entire startup time. WebUI009 owns runtime/travel/browser integration;
Deploy owns package/MIME/HTTPS identity; physical-phone route acceptance pending.
