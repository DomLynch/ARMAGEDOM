# Bounded continuous-painting candidate

Review target: one 1672 x 2823 continuous painting, three viewport heights.
Not active game content; original source files remain immutable.

Protected regions: Westminster original occupies rows 0–940. Preserve its buildings,
Parliament skyline, river, bridge, lion, bus and all painted object positions.
Only rows 861–940 may change at its bottom connection. South original occupies
rows 1882–2822; retain station, bus, steps, banners and painted object positions.
Only rows 1882–1961 may change at its upper connection.

Editable region: rows 861–1961. Paint a continuous middle road, then narrowly
reconcile both edge strips. No UV warping, row-copy blending, blur bands or hard
borders. Road opening at row941 approximately x786–1271; opening at row1882
approximately x736–1003. Kerbs and lane markings must flow between those anchors.
Common ground scale: roughly120 px lane width and110 px local lamppost height,
matching the near-ground Westminster objects rather than adding a second horizon.
Warm amber fire/street lamps, cool smoky fill, worn contemporary London2029–2030.

Acceptance before engine work: inspect both joins at source-sized crops; match
road/kerb position, ground texture detail and lighting; no stretch/smear. Confirm
protected landmarks remain unchanged in position/composition. A regenerated
approved area fails this bounded experiment. Reauthor collision/masks only after
painting passes. Never infer that a generated image is pixel-preserving.
