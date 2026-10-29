# Market contract (client <-> writer <-> database)

Server lane, 28 Oct 2026. Migrations 000025 (items, inventory, loot) and 000026 (shop, buy/sell); 000024 is PR #478's. Not applied to hosted Supabase until the Auditor passes.
All routes are the writer's `POST /arma/<op>` with `Authorization: Bearer <Supabase access token>` and a JSON body (same as `save_run`, `claim_pickup`). Inventory belongs to the account's ACTIVE character.
Database function in brackets, for reference only: the phone never calls them.

Errors at HTTP level: 401 `token`, 403 `no-character` / `O0007` (arma closed), 429 `rate-limited` + `retryMs`. Trade refusals are HTTP 200 with `ok: false`.

## Shop and items

Shop id in v1: `"hub-trader"` (one global shop). Items (ids are fixed rows; `kind` part items drop from elites and bosses and are sell-only; consumables are buy and sell):

| item_id | name | kind | buy (you pay) | sell (you get) |
| --- | --- | --- | --- | --- |
| ammo-pack | Ammo Pack | consumable | 60 | 20 |
| medkit-pack | Medkit Pack | consumable | 120 | 40 |
| vest-patch | Vest Patch | consumable | 250 | 80 |
| hunter-cpu | Hunter CPU | part | null | 150 |
| roach-mandibles | Roach Mandibles | part | null | 40 |
| salamander-gland | Salamander Gland | part | null | 180 |
| military-battery | Military Battery | part | null | 120 |
| robot-parts | Robot Parts | part | null | 90 |
| drone-chip | Drone Chip | part | null | 140 |

Prices are fixed rows, the same for every player, with no depletion. The authoritative list always comes from `market_stock`; do not hard-code the table above.

## Routes

### `inventory_get` [arma_inventory_get + arma_wallet]
Body `{}`. Answer `{ "inventory": [{ "item_id": "hunter-cpu", "qty": 2 }, ...], "cash": n, "bank": n, "ceiling": n|null }` (inventory sorted by item_id, empty array when none).
This is how the shop reads the server's cash BEFORE the first trade: `cash` / `bank` are the stored run's carried and bank (last save, kept in step by every trade), `ceiling` the most the character may hold (null when cash is not enforced). The phone's unsaved pickups can make its local cash higher than `cash`; show the local number, and let the server refuse (`insufficient-cash`) if it disagrees. Call it when the shop opens.

### `item_defs` [arma_item_defs]
Body `{}`. Answer `{ "items": [{ "id", "name", "kind": "part"|"consumable"|"weapon"|"relic", "rarity": 1-5, "base_price", "sell_price" }] }`. `sell_price` is what the shop pays for the item anywhere it is bought; `base_price` is the shop's ask. Use it for names and tooltips; the shop's live prices are `market_stock`.

### `market_stock` [arma_market_stock]
Body `{ "shop_id": "hub-trader" }`. Answer `{ "stock": [{ "item_id", "name", "buy_price": number|null, "sell_price": number|null }] }`.
`buy_price` is what the PLAYER pays (null: the shop does not sell it); `sell_price` is what the PLAYER receives (null: the shop does not buy it). Always `sell_price <= buy_price`. Unknown shop: `stock: []`. Same list for everyone on a given UTC day (a row may be limited to one UTC weekday, so re-read at midnight UTC).

### `buy_item` [arma_buy_item]
Body `{ "shop_id", "item_id", "qty": 1..99 (integer), "request_id": "<8-64 chars A-Za-z0-9_->" }`. Make a NEW random request_id per click and REUSE it when you retry the same click after a lost answer.
Success: `{ "ok": true, "cash": n, "bank": n, "delta": -total, "ceiling": n, "inventory": [{item_id, qty}], "replayed": false }`.
- `delta` is the signed cash change. Apply it to your local carried cash. `cash` / `bank` are what the server's stored run now holds (a reload would show these); the phone's own unsaved pickups may make its local number higher, so do not overwrite local cash with them. `ceiling` is the most the character may hold in total; the next save is clamped to it.
- Refusals are HTTP 200 `{ "ok": false, "error": <code> }`. EXACT codes (hyphens, not underscores):
  - buy_item: `guest`, `bad-request`, `cash-not-enforced` (migration 000027: with `enforce_cash` off the market is closed for buy and sell, nothing written), `request-conflict`, `not-for-sale` (unknown shop, unknown item, or an item the shop does not sell today), `insufficient-cash` (also carries `ceiling`), `inventory-full` (9999 cap).
  - sell_item: `guest`, `bad-request`, `request-conflict`, `not-bought` (unknown shop or the shop does not buy it today), `insufficient-qty`.
  - A replay is NOT an error: it is `ok: true` with `replayed: true`. A refused request id is not burned (retry it freely).
- Guests: a guest is an anonymous Supabase session. They can play, hold loot and call `inventory_get`, `item_defs` and `market_stock`, but `buy_item` and `sell_item` answer `{ ok: false, error: "guest" }`. Only a linked (Google) account trades. The writer rejects nothing at HTTP level for guests.
- Other HTTP failures: 403 `no-character` (no active character), 403 `O0007` (arma closed for this account), 429 `rate-limited`.

### `sell_item` [arma_sell_item]
Same body and success shape (`delta` is positive). Codes listed above.

### Replay
Repeating a request_id with the same arguments returns the first answer byte for byte with `"replayed": true` (its `inventory` is the snapshot from the first call; call `inventory_get` for the present). Nothing is debited, credited or granted twice. Replay rows live 7 days.

## Kill credit gains loot (`claim_pickup`, existing route)
Body adds two optional fields: `"enemy": "<creature kind, e.g. boss-warden>"` and `"killId": "<8-64 chars, unique per kill>"`. Send both for every kill claim.
Answer for a credited kill: `{ "credited", "earned", "loot": [{ "item_id", "qty" }] }`. `loot` is `[]` when nothing dropped (the usual case: drops are rare, elites and bosses only). The server rolls it; the client never names an item. Stash and airdrop answers have no `loot` key.
A retry with the same `killId` and arguments answers the first answer plus `"replayed": true` and credits and rolls nothing; reusing a killId with different arguments gives `{ "refused": "request-conflict" }`. Other refusals are unchanged (`bad-amount`, `rate-limit`, `unknown-source`, `too-soon`), plus `bad-kill-id` and `bad-enemy`. Loot is keyed by the `enemy` kind alone (rare creatures and bosses: original-roach, giant-salamander, low-hover-drone, boss-area7-knight, boss-area8-veteran, boss-warden, boss-butcher); any other enemy answers `loot: []`.

How loot reaches the client: it rides ONLY on the `claim_pickup` reply for a kill-tier source (`kill:trash|creature|boss`), which today the client sends when a kill's coin drop is picked up (`killDrops.enabled`). A kill whose coin is never claimed rolls no loot. With `killDrops.enabled` false nothing calls it, so no loot flows. Turning it on is safe with `enforce_cash` ON: that is exactly the path migration 000018 built (server-credited, range and rate checked, raises the ceiling); today's kill cash from the world settle (`arma_payout_rules`) is separate and unchanged. The route's bucket is 4 burst, 1 per 5 s: queue claims and keep the same `killId` on every retry.

## Rules the server enforces
- Cash is only ever granted by the server (kills, stashes, sells). A buy needs `price*qty <= ceiling` and lowers the ceiling by that amount; a sell raises it by the sale. A save of a richer record than the ceiling is clamped (`clamped: true`, `carried`, `bank`), as before.
- Buy price is never below sell price, across every shop, so buy then sell always loses money.
- Inventory is written only by the server functions above; a client has read-only access to its own rows.
