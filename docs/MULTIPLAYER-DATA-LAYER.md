# Multiplayer data layer (A2): the server-held player record

Backend lane, 24 Oct 2026. A design for the first PR of A2, with the four rulings it needs. Nothing here is built or applied.
Goal (Lead's brief): the writer holds the player record (cash, bank, bounty, inventory, weapons, progress), versioned, with a sequence
number so a retry is idempotent, and with abuse caps from day one: a per-token rate limit, server-side value caps, and no client-sent cash delta.

## What exists today

`arma_runs` holds ONE row per character: the game's whole v18 save record (`record`), its `era`, and a server `revision`.
`arma_save_run(account, character, era, record, expected_revision)` refuses a wrong era, a record that is not an object of that version, and
a stale revision (a second device, or a retry). The writer already has `load_run` and `save_run` routes over it, one request at a time per account.

The v18 record (from `Web/tests/fixtures/navigation203-source202-v18.json`) has these groups:

| Group | Fields | Who should author it |
| --- | --- | --- |
| money | `marked.carried`, `marked.bank`, `marked.bounty` | the server |
| ownership | `rifle`, `bossEquipment.*`, `uniqueReward`, `expedition`, `vest`: `status`, `rewardReceipt`, `selected*` | the server (receipts come from kills) |
| progress | `progression.proficiency`, `progression.awards`, `progression.attributes` | the server (earned by kills) |
| consumables | ammo `magazine`/`reserve`, `locker.ammo`, `flameFuel.fuelUnits`, `supplies` | the client, capped |
| state | `hp`, `animalCycle`, `openingStory`, `droneDeaths` | the client, capped |

## What is missing against the brief

1. **Retries are not idempotent.** A save that succeeded but whose answer was lost is retried with the old revision and refused as `stale`;
   the phone cannot tell "applied" from "someone else wrote".
2. **No shape or value limits.** Any object with the right `version` is stored: unknown keys, negative or absurd numbers, a 1 MB blob.
3. **The phone authors its own money.** Nothing stops a record that raises `carried` by a million.
4. **No per-token rate limit on saves.** Presence has one per socket; the writer's `/arma/api/` has only the nginx per-IP limit.

## Proposal (three small PRs, each tier B, each with tests)

**PR 1: the envelope (sequence number, shape, caps).** BUILT in migration 000007 (not applied anywhere). As built: refusals are `{refused: 'shape'|'cap', reason: 'cap:<path>'}`;
caps are rows in `arma_record_caps` (longest matching path pattern wins; the numbers are generous ceilings for Combat to tighten); null leaves are allowed (the game
writes `dropPosition: null`); the writer's limits are `DEFAULT_LIMITS` in `server/writer/writer.js` (429 `rate-limited` with `retryMs`).
- `save_run` takes `seq` (client counter, increases on every NEW save attempt, reused on a retry). The ledger keeps `last_seq`, a hash of that
  save and its result on `arma_runs`. Rules: `seq > last_seq` applies; `seq == last_seq` with the same hash returns the stored result (the
  retry is a no-op that answers like the first time); same `seq` with a different hash is a conflict; `seq < last_seq` is stale.
  `revision` stays as the cross-device guard.
- `arma_check_record(prev, next)`: a CLOSED set of top-level keys (the v18 list above), integers only where the game has integers, every
  number inside a cap row in `arma_record_caps` (hp, ammo, fuel, attribute 10..20, proficiency 0..100, awards length, record size). Refusals
  carry a reason (`shape`, `cap:<path>`), so the Auditor can see which path failed.
- Writer: a per-account token bucket on `save_run` (proposal: sustained 1 save per 5 s, burst 3) and on `load_run` (1 per second). 429 on excess.

**PR 2: money the client cannot raise.**
- `carried + bank` may move between the two and may go DOWN (spending), but a save can never raise the total. The only way up is a server
  grant: `arma_grant(account, character, kind, amount, event_id)`, idempotent through the existing `arma_events` ledger, called by the
  writer on a server event (a kill pays `arma_payout_rules(kind, cash)`; the same row set Combat's single-player tables already imply).
- `bounty` and the other server-owned fields follow the same rule as ruled below.

**PR 3: ownership and progress by receipt.**
- A weapon or boss-equipment `status: owned` needs the matching `rewardReceipt` to exist in `arma_loot` for this character (the minting is
  already server-side in `arma_spawn_hit`). `proficiency` and `awards` can only rise by the amounts a server kill event grants.
- This is also what lets presence refuse a weapon the player does not own (the Auditor's before-hosting item 1 on #59): presence asks the
  writer for the character's owned weapons once per join.

## Rulings needed (these change what I build)

1. **Earning rules.** What earns `carried`, `bounty`, proficiency and awards in the single-player game, and where are those tables? PR 2 and 3
   need `arma_payout_rules` and the award amounts as rows, generated from the game's own tables the way the weapon rules are (never typed).
   Owner: Combat.
2. **Existing local saves.** A guest who played offline holds a record they authored. Options: (a) start every online character fresh (no
   import; cleanest, loses offline progress); (b) one-time import of the first save only, capped at a fresh character's maximums; (c) accept
   any first save (no integrity for that character). I recommend (a) for the live world and a separate, capped, one-time import if Dom wants
   offline progress kept. Owner: Strategy/Dom.
3. **Which fields are server-owned in Phase A.** My table above is the recommendation: money, ownership and progress by the server;
   consumables and state by the client with caps. Anything the client authors is cheatable by design (ammo, hp); the caps bound the damage,
   they do not prevent it. Owner: Lead/Strategy.
4. **Rate numbers** (saves 1 per 5 s, burst 3; loads 1 per second) are my proposal; change them freely.

## What this does not do

It does not make the single-player rules server-authoritative. Hits are already clamped by weapon caps and applied by the database; money and
ownership come with PR 2 and 3; everything else the phone computes stays the phone's, bounded by the caps. A full server-side simulation is Phase B.

## Order and estimate (mine, not a promise)

PR 1 about a day including tests and an Auditor round; PR 2 and 3 about two days each once rulings 1 and 3 are in and Combat's tables exist.
Nothing is applied to a hosted project until Lead says go.
