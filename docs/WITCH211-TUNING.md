# Ember Matron tuning 211

Owner-directed Witch-only change from published210:

| Setting | Before | After |
| --- | ---: | ---: |
| Movement speed | 1.4 | 1.75 |
| Flame contact and visible reach | 3 | 4.05 |
| Legal acquisition distance | 3 | 4.05 |
| Post-burst cooldown | 72 ticks / 1.2 s | 58 ticks / 0.967 s |
| Warning | 42 ticks | unchanged |
| Active burst | 24 ticks | unchanged |
| Pulse spacing and damage | 12 ticks, two ×4 HP | unchanged |
| Cone | 40 degrees | unchanged |

58 ticks is the nearest integer to a20% reduction in the existing72-tick cooldown. Minimum warning-to-warning cycle drops138→124 ticks (2.3→2.067s). The72-tick value was a validator floor and next-attack clock, not a native flame recovery clip; no new cooldown field or timer is introduced. Other bosses retain their previous validation limits.

The same Witch weapon profile supplies acquisition, actual `flameTouches` contact and the pooled flame's distance interpolation. Player flame rules, Salamander colour/AI/contact, health regeneration, walls, refuge, gates, rewards, saves and particle capacity remain unchanged.

A farther root acquisition alone does not prove damage extension: the muzzle projects forward and the target has a body envelope. The actual-actors check uses normal retreat during the locked warning to find an old3m MISS/new4.05m HIT at the actual held muzzle before requiring real pulses. Fixed pose matrices also verify visible emission beyond3m. Source-level fixtures and controlled initial browser entry are declared separately from phone or continuous-route acceptance.
