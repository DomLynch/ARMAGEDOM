# Witch212: faster cycle and thicker visual flame

From live211: movement1.75→2.275, shared acquisition/damage/visual reach4.05→4.86. Eligible warning onset period124→62 fixed ticks:6 preparation +24 active +32 recovery. The existing next-ready clock provides this period; no timer or new attack framework. Two4HP pulses,12-tick spacing and40-degree DAMAGE cone remain unchanged.

Only the Witch's ground-warning triangle is suppressed. Her per-emission widthScale2 multiplies sprite width; other emitters default1. Particle centres, radial spread, palette, fixed36-slot pool, one draw and contact geometry remain unchanged. Wider sprites overlap more without introducing a shader, texture, light or new pool. This does not claim unchanged physical-phone FPS.

Checks reuse the corrected211 Witch/weapon-family/amount observer (flame moveId is null). A fixed-step test requires successive eligible warnings62ticks apart. Actual model/muzzle retreat uses ordinary sprint, allowing the second pulse to prove old4.05MISS/new4.86HIT despite the shortened preparation. Matrix comparisons verify twice the sprite basis with identical centres/default appearance; the actual Witch scene must add no warning line. Production browser health accounting includes regeneration and every actual hit.
