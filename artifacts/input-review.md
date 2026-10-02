# Input review — 2026-10-02

- Unity Pipeline W-key hold moved the player from (0, -6) to (-1.7254, -3.5557).
- Pipeline Space simulation did not set `dodgeReady`; retained in input-check.json
  as a failed simulated-input observation, not a passing check.
- Retest through native keyboard input (`cua_repl`, Unity Game View, Space) set
  `dodgeReady` to 57.75313 and moved the player. This confirms the actual keyboard
  path; no gameplay code was changed to accommodate the simulation.
- Play Mode tests separately verify invulnerability, expiry and cooldown.
- Visual review found coplanar floor surfaces and health-label overlap; corrected
  foundation height and label spacing. Repeated Play Mode suite: 4/4 passed.
