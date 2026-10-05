# Hollow neck repair and appearance ingredient pilot — 2026-10-05

**Concrete neck repair ready for integration review; two head/complexion/hair extremes demonstrated.** Separate art candidates only: frozen034/035, player, gameplay and other owners' runtime files untouched. No50-recipe delivery, gaunt body, production or phone acceptance claim.

## Root cause and bounded repair

The Hollow builder's keep-list in character-web/art/hollow-scavenger/build.mjs retained Skin/Gambeson/Photo/PhotoEyes/PhotoTeeth/boots and deleted the donor **Face** mesh. Despite its name, Face is the **lower neck**, spanning bind-space y1.472738–1.566301. Photo starts at y1.552072. Removing this intervening weighted surface exposes the gap when Hit lifts the jaw. Source034 original GLB/motion bytes were already verified unchanged from033.

The candidate restores ONLY that donor mesh on its original node with original JOINTS/WEIGHTS, original skin11 joints and numerically identical inverse binds. No new bones, positional neck hack, weight transfer or modified animation. A private matte material samples natural skin colour from the original Photo's cheek texture; the first pale flat-colour neck was superseded and its receipt retained. Original fallback remains byte-identical.

## Pilot ingredients

`proof-final/neck-repair.glb`: restored neck plus original appearance. Existing skin/clothes/eyes/teeth/boots materials unchanged; only private neck material added.

`proof-final/narrow-light.glb`: head width .87/height1.035; shared bind-space field applied to Photo, eyes and teeth, smoothly zero below y1.59. Natural complexion field also applies to exposed body skin and private neck.

`proof-final/broad-deep.glb`: head width1.12/height.98, deep-brown complexion and a small rigged rough-cropped hair shell from the original crown. The hair is an initial faceted crop ingredient, not finished detailed strands or the full hairstyle library.

UVs and weights preserved. Modified head normals use inverse-transpose of the deformation Jacobian. Head controls preserve neck transition, bone lengths and animations. Gaunt body geometry is not authored in this pilot; combine its later radial-thickness field with these compatible head controls in this same authoring lane.

These three full GLBs are **representative archive models**, not a proposal to load50 complete bodies. Shared controls/meshes and the new pure recipe contract should be integrated later. `INTERFACE.md` pins the proposed exports/ID/fallback/lookup semantics; it explicitly does not supply an approved50-entry library.

## Evidence and scope

Original build/capture `input-43f5898f7517`:19.01sEXIT0/10inputs; superseded pale neck/head-collage framing retained in proof/.

Final model/pose pilot `input-f49a70cea6a2`:30.02sEXIT0/17inputs.25 samples include six native poses, seven additional Hit phases, Crooked Idle/Walk/Hit/Death and Crooked85/115 Walk/Hit. Finite sampled geometry, maximum bone delta3.103e-15 and knife-matrix delta2.981e-14 versus unchanged fallback at matched motion. No page errors. These samples do not establish continuous clearance.

Personally viewed corrected full-body Idle/Walk/Attack/Guard/Hit/Death, head close-up, Crooked poses and size extremes. Restored neck closes the visible Hit gap, including Crooked combat reset/minmax. Head/eye/teeth alignment has no gross visible regression in these views. Studio pair stills support the head/hair/complexion ingredient direction; subtle head changes are less readable at game distance.

Initial London positions cropped the right figure/corpse. Same-model framing-only successor `london-input-23eb98d03ceb`:7.02sEXIT0/16inputs, model hashes checked; fully visible front-facing Walk/Hit/Death393×852 and Walk852×393 personally viewed, selected006 actor/camera scales and unchanged Westminster art. These are **isolated art camera** scenes, not gameplay, roster allocation or phone evidence. Movement is a sampled pose, not a real travel loop.

Format job `format-input-eeda5e44e295`:3.01sEXIT0/7inputs, gltf-validator2.0.0-dev.3.10; exact original and all three exports have0errors. Original7warnings, neck/narrow8, broad9: inherited generated tangent-space warning plus the existing nested-skinned-mesh pattern extended to restored neck/hair. Actual original hierarchy/binds preserved and sampled Three.js deformations checked; no blanket portability/format-clean claim. Summaries in proof-format/.

`proof-final/preservation.json`: every original animation sampler and original node rest data retained; original hierarchy links unchanged with one extra hair child; all five embedded image bytes and eye/teeth/clothes/boot materials identical. First overly strict whole-parent equality check rejected the intentional hair child; corrected criterion allows exactly that new child and preserves every original link. No model change to satisfy the check.

## Costs and delivery

Body43,755tri neck/narrow versus43,099baseline; broad45,192tri. Native knife adds3,194tri: equipped46,949 neck/narrow and48,386 broad versus46,293baseline. Measured four-figure scene48draw calls: original11, neck12, narrow12, broad13; no new textures. Stored models4,329,068 /4,329,108 /4,375,404bytes. Stored payload includes deliberately duplicated original head buffers for this pilot; optimise shared production ingredients before packaging. No phone FPS/memory claim.

Authoritative SHA/bytes: proof-final/build.json and preservation.json. Immutable source inputs and output receipts: request/result per proof folder. CPU work used existing VPS queue, no HF/GPU/paid generation; Claude untouched/hooks off.

Next: Lead review of bounded neck recovery; Characters authors remaining shared hairstyle/head/complexion/weathering ingredients and actual50 recipes/contact sheet; World implements deterministic assignment only after final pinned library. WebUI alone integrates after035. Appearance/player/material isolation and compiled corpse/refresh/area identity checks remain integration tasks, with physical-phone appearance separate.

Reproduce: restore input assets from canonical pinned donor/Hollow/knife locations and input Web package/lock from035-compatible runtime. Verify hashes against request.json, then submit input/ through vps-run.py with `bash run.sh`. London/format inputs separately reproduce their bounded receipts; do not rerun unchanged native combat gates.
