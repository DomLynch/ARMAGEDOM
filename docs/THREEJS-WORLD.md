# London Three.js world checkpoint

2026-10-03. Scoped World port under Lead's Web/CONTRACT.md. Unity Game/, source
paintings, frozen Mac and live006 are untouched. Use lane-only files; do not merge
the private starting baseline wholesale.

Integration: Web/src/world.js + world-geometry.js; Web/public/world/**;
Web/tests/world*.test.js. Plain ES modules, injected Three0.182.0, no additional
product dependency. Lead owns package/lock/main/actors/lighting/input/combat/HUD.
`createWorld` returns the requested interface, plus layout, geometry, masks and
cameraRight/cameraForward. Input domain remains Unity{x,z}; render is(x,y,-z).
Actor scale remains1.265 in layout; Lead's actor visuals must apply it once.

Only world/westminster/layout.json and backdrop.png load initially (2,905,471
raw bytes). Original1672×941 PNG copied byte-for-byte. Audited Travel-west layout
includes follow-size candidate at base zoom1.485, follow0.45. Scene camera is fixed
at Three(0,23,26), look-at(0,0,-6), FOV42. Adaptive common crop keeps a grounded2m
probe size constant. Additional aspect crop covers phone/desktop view without
stretching painting; ground picking uses the cropped inverse. Masks are depth-only
convex meshes at their saved foot depth. Circle movement includes.061m boundary
clearance, substeps and sliding; ray visibility rejects solid polygons.

Verification: seven Node tests pass after two real missing-feature red runs. They
cover golden Unity registration, blocker tunnelling/sliding, all26 audited pavement landmarks connected by production circle movement across
all three portable layouts, aspect crop registration,
fixed camera/constant actor size and resource disposal. Actual Chromium151 browser
WASD moves the probe about2.5m; checkpoint mask reduces cyan actor pixels1951→1170
behind the barrier, the same probe in front stays2179→2179pixels, solid-blocker
movement stops4.2m short of its centre, and console has0page errors. Desktop1280×720 and844×390 landscape
captures in artifacts/threejs-world/. This is a geometry probe, not character
art/full fight/physical phone/hosted acceptance. Lead owns integrated fight gate.

Existing south/east originals, layouts and travel link thresholds are retained
in public/world; they are lazy content and no runtime transition is claimed in
this first checkpoint. World owns their eventual loader/camera/masks; Lead owns
combat parking/resume and actor continuity across transitions.

Receipt: artifacts/threejs-world/receipt.json and browser-receipt.json.
Local proof: serve Web on127.0.0.1:8891, open tests/world-proof.html. It uses the
locally installed pinned three package; `node --test Web/tests/*.test.js` uses
Lead's package installation. Test harness is not a shipping game entrypoint.
