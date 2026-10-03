# One covered physical passage study

Decision from Lead: one bounded static alternative, no additional painting loops.
No Unity operations until the character lane explicitly releases its checkpoint.

Protected pixels: original Westminster and south textures remain byte-identical;
original landmark positions remain exact. Connector-v1 remains unchanged as input.
Remove row-smear and UV stretch from the static study. Composite a separately
painted roof above the full-width join, with side supports outside the road.
This is a visible damaged concrete/steel service viaduct/covered crossing; no
fade, camera cut, teleport, black screen or loading-screen substitute.

Common coordinates: width1672; panel height941; joins at worldY941 and1882.
Target: all1672 seam pixels concealed by opaque physical structure, with at least
32px coverage above and below each join. Roof maximum240px ground-image depth
(396px at zoom1.65), below half of the941px game viewport. No hole/gap across the
seam anywhere, including exposed outer pavements. Supports only at outer edges,
never on the road. Native-sized entry/under-roof/exit crops must show continuous
road outside the roof and convincingly grounded supports. Draw order: ground,
actor/contact shadow, then roof foreground mask. No gameplay-blocking roof collider.

Static framing: viewport1672x941, zoom1.65, camera centre follows actor minus.1
panel height; common scale actor71px before zoom (~117px on screen), matching
actual-engine01-first-seam.png. SVG stand-in communicates occlusion/scale only;
character equipment/lighting/contact are not judged by this static artwork study.
Show both complete join viewports, full panel width overview and entry/exit
sequence at each join. Pixel alignment/opaque coverage are necessary; physical
believability and mismatch exposure remain visual acceptance checks.
