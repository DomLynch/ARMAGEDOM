# Market contract (client <-> writer <-> database)

Server lane, 28 Oct 2026. Migrations 000024 (items, inventory, loot) and 000025 (shop, buy/sell). Not applied to hosted Supabase until the Auditor passes.
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

### `inventory_get` [arma_inventory_get]
Body `{}`. Answer `{ "inventory": [{ "item_id": "hunter-cpu", "qty": 2 }, ...] }` (sorted by item_id, empty array when none).

### `market_stock` [arma_market_stock]
Body `{ "shop_id": "hub-trader" }`. Answer `{ "stock": [{ "item_id", "name", "buy_price": number|null, "sell_price": number|null }] }`.
`buy_price` is what the PLAYER pays (null: the shop does not sell it); `sell_price` is what the PLAYER receives (null: the shop does not buy it). Always `sell_price <= buy_price`. Unknown shop: `stock: []`. Same list for everyone on a given UTC day (a row may be limited to one UTC weekday, so re-read at midnight UTC).

### `buy_item` [arma_buy_item]
Body `{ "shop_id", "item_id", "qty": 1..99 (integer), "request_id": "<8-64 chars A-Za-z0-9_->" }`. Make a NEW random request_id per click and REUSE it when you retry the same click after a lost answer.
Success: `{ "ok": true, "cash": n, "bank": n, "delta": -total, "ceiling": n, "inventory": [{item_id, qty}], "replayed": false }`.
- `delta` is the signed cash change. Apply it to your local carried cash. `cash` / `bank` are what the server's stored run now holds (a reload would show these); the phone's own unsaved pickups may make its local number higher, so do not overwrite local cash with them. `ceiling` is the most the character may hold in total; the next save is clamped to it.
- Refusals `{ "ok": false, "error": ... }`: `insufficient-cash` (also `ceiling`), `not-for-sale`, `inventory-full` (9999 cap), `bad-request`, `request-conflict` (that request_id was already used for something different). A refused request id is not burned.

### `sell_item` [arma_sell_item]
Same body and success shape (`delta` is positive). Refusals: `insufficient-qty`, `not-bought` (the shop does not buy that item), `bad-request`, `request-conflict`.

### Replay
Repeating a request_id with the same arguments returns the first answer byte for byte with `"replayed": true` (its `inventory` is the snapshot from the first call; call `inventory_get` for the present). Nothing is debited, credited or granted twice. Replay rows live 7 days.

## Kill credit gains loot (`claim_pickup`, existing route)
Body adds two optional fields: `"enemy": "<creature kind, e.g. boss-warden>"` and `"killId": "<8-64 chars, unique per kill>"`. Send both for every kill claim.
Answer for a credited kill: `{ "credited", "earned", "loot": [{ "item_id", "qty" }] }`. `loot` is `[]` when nothing dropped (the usual case: drops are rare, elites and bosses only). The server rolls it; the client never names an item. Stash and airdrop answers have no `loot` key.
A retry with the same `killId` and arguments answers the first answer plus `"replayed": true` and credits and rolls nothing; reusing a killId with different arguments gives `{ "refused": "request-conflict" }`. Other refusals are unchanged (`bad-amount`, `rate-limit`, `unknown-source`, `too-soon`), plus `bad-kill-id` and `bad-enemy`. Loot for an enemy only drops under its own tier (`kill:creature` or `kill:boss`).

## Rules the server enforces
- Cash is only ever granted by the server (kills, stashes, sells). A buy needs `price*qty <= ceiling` and lowers the ceiling by that amount; a sell raises it by the sale. A save of a richer record than the ceiling is clamped (`clamped: true`, `carried`, `bank`), as before.
- Buy price is never below sell price, across every shop, so buy then sell always loses money.
- Inventory is written only by the server functions above; a client has read-only access to its own rows.
