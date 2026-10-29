# Kill cash and rare loot: what the server proves today

Auditor-authored, 29 Oct 2026, read-only trace of main at ba1ff69a. "Inference" marks anything not read directly from code or data.
Finding under review: kill cash and rare loot are client-claimed, with no proof a kill happened.
Verdict: the finding is correct. The route is open today, whether or not PR #490 is merged, and it is bounded only by rate, not by proof.

## 1. What a malicious client can claim, and what already bounds it
Path: `POST /arma/claim_pickup {source, amount, enemy, killId}` -> `server/writer/writer.js:93-103` -> `arma_claim_pickup` (migration 000025, lines 124-170).
- The client sets `source` (kill:trash|creature|boss), `amount`, `enemy` and `killId`. Honest client: `Web/src/engine/kill-drops.js:75` -> `world-pickups-core.js:84-87` (`g.cashClaims`) -> `browser-session.js:381` -> `save-client.js:253`. A curl loop skips all of that.
- The function never reads `arma_spawns`, `arma_spawn_engages`, `arma_spawn_damage` or `arma_events` (000025:124-170). Nothing links a claim to an engage, a hit or a settled kill.
- The server accepts `kill:*` today. `killDrops.enabled=false` (`Web/src/data/killDrops.json:3`) only stops the honest client from sending them. The 000018 tiers and 000025 loot are live.
- Amount check: a whole number inside the tier range (000018:27-30, 000025:130): trash 1-10, creature 11-20, boss 21-40.
- killId is a replay guard, not proof of a kill. Same killId and arguments return the stored answer (000025:135-141). A fresh random killId is a new "kill". A reused id with other arguments is refused (`request-conflict`).
- Per-tier cap per character (000018:27-30, 000025:143-148): trash 30 per 60 s, creature 15, boss 3.
- Writer bucket per account (`server/data/rate-limits.json:12`, `writer.js:51-59,239`): burst 4, then one per 5 s. That is 12 per minute sustained, 720 per hour, shared by all the account's characters (bucket key is the account). Calls run one at a time per account (`writer.js:177-183`).
- `enforce_cash` is true on the hosted DB (Lead's fact, not re-read). The ceiling is `start_cash_total + arma_cash.earned` (000008:73-81, 000026:53-56). A kill claim adds to `earned` (000025:150), so the ceiling rises with every claim. It stops a phone holding cash nobody credited. It does not stop a phone being credited, so it bounds nothing here.
- Limits that do hold: the account must be allowed (`arma_allowed`; guests count while `arma_open_access` is true, 000005), the character must belong to the account, the amount range, the rate, and 5 characters per account (000015).

Worst case, one account, derived from the data rows (arithmetic, not a measurement):
- Kill claims only: 12 a minute, split 3 boss at $40 plus 9 creature at $20 = $300 a minute, **$18,000 an hour**. Trash is never worth sending.
- Already exposed without kills (000017:26-35): 8 stashes at $180 per 180 s each, plus the airdrop at $400 per 60 s. That is $880 a minute, about $52,800 an hour, using 3.7 of the 12 requests a minute. Source ids are fixed rows, so no kill is needed.
- Both together: kills use the 8.3 spare requests, so +$227 a minute (about +$13,600 an hour), total about **$66,000 an hour per account**.
- Inference: more guest accounts multiply this; only Supabase's own signup limits stand in the way. The binding limit is the per-account bucket, not the per-tier caps.
- Rare loot (000025:68-76): the server rolls it, but the attacker picks `enemy` and the tier (the tier only has to match the loot row). At 3 boss claims a minute, `boss-warden` rolls hunter-cpu at 10% (sells for 150): about $45 a minute expected. `low-hover-drone` on the creature tier is about $15.6 a claim (6% drone-chip at 140, 8% robot-parts at 90). Inference: small beside the cash, but items sell back through the shop (000026), so it is more cash, not a separate loss.
- The server-settled kill path (000002:137-190, 000008:46-52) is separate and proof-based: real engage, real applied damage, then `arma_payout_rules` pays $100-200, capped at 6 kills a minute and 120 an hour (`arma_world_config`, 000002:14-15). A curl loop cannot abuse it.

## 2. What the server would need to verify for "a kill happened"
Already server-side and unused by the client:
- `spawn_engage` (`writer.js:131-138`, `arma_spawn_engage` 000002:111-135): kind, area and maxHp come from the world rows (`spawnRows`), never the phone. It issues a token; 4 open engages per account (`max_open`).
- `arma_spawn_hit` and `arma_spawn_hit_batch` (000002:137-205, 000009): needs the token and a weapon in `arma_weapon_rules`. Applied damage is clamped by elapsed time, hits per second and damage per hit, times `dps_slack`. The database kills the spawn at hp 0 and writes `arma_events` `kill:<instance>:<generation>:<account>`, unique per incarnation.
- Presence (`server/presence/server.js:109-190`): `{t:"hit"}` over the websocket with a second clamp (`hitSlack`, instance must exist in the area), batched to `/internal/hits`, answered with `hit-result` (`killed`, `paid`).
- The client sends no `hit` and calls no `spawn_engage` anywhere under `Web/src` (grep: no matches). Inference: so no real hit has flowed from the current client.
- Presence also reports locations (`arma_save_location`, `writer.js:142-145`), usable for distance checks. Inference: nothing compares them with enemy positions today.

Still missing for a proof:
- A link from claim to settled kill: `arma_claim_pickup` takes the engage token (or instance and generation), or reads the character's own `kill:*` event: unconsumed, recent (about 60 s), kind equal to the claimed `enemy`.
- Tier, enemy and loot key taken from the server's kind (`arma_spawns.kind`), never from the client's `source`/`enemy`. Amount rolled or clamped server side.
- Single use: one settled kill, one credit (a consumed flag or id column), so a kill cannot be claimed twice or as another kind.
- Time plausibility mostly exists already (elapsed and dps clamps in `arma_spawn_hit`). Inference: only a distance check (player within weapon range of the spawn) is absent; optional for a first cut.

## 3. Minimal additive path (proposal for Lead to rule on)
1. Client, behind data flag `killProof.enabled` (default false) with URL off switch `?nokillproof=1`: on first damage to a creature call `spawn_engage {instance}` and keep the token; send `{t:"hit"}` over the presence socket with it while damaging; read `hit-result.killed` and `paid`.
2. Server, one additive migration (`arma_claim_pickup` keeps its signature, for rollback): a settled `kill:*` event of this character is claimable once. Behind `arma_config.require_kill_proof` (default false): when true, a `kill:*` claim must name the killed instance or generation, and tier, enemy and loot key come from that event.
3. Rollout: ship wiring and migration with both flags off. Prove engage -> hit -> kill -> claim online on a staging character. Then set `require_kill_proof` true, which refuses the old unproved kill tiers at that moment (refused, not removed). Rollback is the config flip.
4. Untouched: `arma_spawn_hit`, `arma_spawn_hit_batch`, the payout trigger (000008). Stash and airdrop rules (000017) stay as they are: unproved by design, only rate-limited, and the bigger standing exposure (about $52,800 an hour). Closing them is a separate decision (server-side stash state, or a lower rate).

## 4. PR #490 (flips `killDrops.enabled` and `shops.json enabled`)
- The flip does not widen the hole. `kill:*` is already accepted, so the worst case is the same with or without it: about $18,000 an hour per account from kills, about $66,000 an hour with stashes and the airdrop.
- It does put real players on an unproved path: honest and forged cash sit side by side, and the shop turns cash into items and items back into cash. Inference: any balance, leaderboard or "earned" claim built on `earned` is untrustworthy until the proof lands.
- Safe to flip for the alpha only if Lead accepts that ceiling as a logged, known exposure. It is not a proven economy.
- Recommendation: do not hold #490 on the wiring. Flip it with the exposure in the release note, ship section 3 as the next PR, and do not describe cash or the shop as "earned in play" until `require_kill_proof` is on. If Dom wants no forged-cash window at all, hold #490 until section 3 step 3 is done.
