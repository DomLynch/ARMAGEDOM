# Player health regeneration 209

Production browser sessions explicitly enable the existing engine's health-regeneration option. Living players regenerate their current maximum health divided by 60 per active simulation second: 2.5 HP/s at 150 max HP. Missing fractions take proportionately less time. There is no new combat delay, wall clock, offline grant or revival. Existing pause, travel and terminal simulation boundaries apply.

The existing successful-write snapshot guard coalesces regeneration-only growth for at most one simulation second. Live HP stays fractional. Full health, actual damage (including damage that leaves HP above the previous checkpoint), resource/ledger changes, maximum-health changes and death retain immediate persistence. The unified save shape, writer and validation remain unchanged. A crash can discard up to one second of recent regeneration; it cannot grant offline health.

Read-only donor inspection found stamina regeneration and creature return-home healing, but no working player-health regeneration. The unused donor six-second constant is not a player-health policy.

Component checks cover a complete health bar, proportional partial bars, changed max HP, damage, pause/death, fractional save/restore, invalid saves and write count. Packaged browser checks load genuine release208 saved damage as a declared initial fixture, then verify production enablement, visible regeneration and pause/cap behavior. No physical-phone acceptance or new combat encounter is implied.
