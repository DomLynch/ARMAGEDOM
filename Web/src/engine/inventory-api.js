// The ONE place the client talks to the server about inventory. Contract: docs/MARKET-CONTRACT.md (branch server/market), body `{}` for both:
//   inventory_get -> {inventory: [{item_id, qty}], cash, bank, ceiling}   the active character's items (the shop reads cash and ceiling too)
//   item_defs     -> {items: [{id, name, kind, rarity 1-5, base_price, sell_price}]}   names and prices for the card
//   claim_pickup (kill:* sources) is sent with `enemy` and `killId`; its reply carries `loot: [{item_id, qty}]` (usually empty). The server
//   rolls loot from the enemy kind; the client never names an item.
// `send(op, body)` is the save client's request function (it adds the token); it answers a parsed reply or {error}. Every method answers a plain
// object and never throws: offline or refused is {ok: false}, so the screen shows its friendly note instead of crashing.
import { GAME_DATA } from "./game-data.js";

// Rows from the server, cleaned: known shape only, whole positive quantities, one row per item.
export function normalizeRows(rows) {
  const sums = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const itemId = row && row.item_id,
      qty = row && row.qty;
    if (typeof itemId !== "string" || !itemId || !Number.isSafeInteger(qty) || qty < 1) continue;
    sums.set(itemId, (sums.get(itemId) ?? 0) + qty);
  }
  return [...sums].map(([item_id, qty]) => ({ item_id, qty }));
}
// The loot a kill-credit reply carries (empty when it carries none or something malformed).
export const lootFromReply = (reply) => normalizeRows(reply && reply.loot);

const price = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
// The server's item rows, as a map id -> {name, kind, rarity, basePrice, sellPrice}. Unknown fields are dropped, bad ones left out.
function normalizeDefs(rows, rules) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = row && (row.id ?? row.item_id);
    if (typeof id !== "string" || !id) continue;
    const def = {};
    if (typeof row.name === "string" && row.name.trim()) def.name = row.name.trim();
    if (rules.kinds.includes(row.kind)) def.kind = row.kind;
    if (Number.isInteger(row.rarity) && rules.rarityOrder[row.rarity - 1]) def.rarity = rules.rarityOrder[row.rarity - 1]; // server: 1 to 5
    if (price(row.base_price) !== null) def.basePrice = price(row.base_price);
    if (price(row.sell_price) !== null) def.sellPrice = price(row.sell_price);
    map.set(id, def);
  }
  return map;
}

export function createInventoryApi({ send, rules }) {
  const data = rules !== undefined ? rules : GAME_DATA.loot;
  let defs = null;
  return {
    async get() {
      if (typeof send !== "function") return { ok: false, items: [], reason: "offline" };
      const reply = await send(data.ops.inventory, {});
      const rows = reply && reply.inventory;
      if (!Array.isArray(rows)) return { ok: false, items: [], reason: reply && reply.error ? reply.error : "offline" };
      return { ok: true, items: normalizeRows(rows) };
    },
    // The items table, asked once and kept; a failed ask is retried on the next call and the local look is used meanwhile.
    async itemDefs() {
      if (defs) return defs;
      if (typeof send !== "function") return new Map();
      const reply = await send(data.ops.items, {});
      const rows = reply && reply.items;
      if (!Array.isArray(rows)) return new Map();
      defs = normalizeDefs(rows, data);
      return defs;
    },
  };
}

// For tests and the offline preview: the same interface over local data. `fail` makes every call answer offline.
export function createMockInventoryApi({ items, defs, fail } = {}) {
  const rows = new Map(normalizeRows(items).map((r) => [r.item_id, r.qty])),
    table = normalizeDefs(defs, GAME_DATA.loot);
  const api = {
    calls: 0,
    async get() {
      api.calls++;
      if (fail) return { ok: false, items: [], reason: "offline" };
      return { ok: true, items: [...rows].map(([item_id, qty]) => ({ item_id, qty })) };
    },
    async itemDefs() {
      return fail ? new Map() : table;
    },
    // What the server does when a kill credit pays loot: the rows grow, and the same list is what the reply carries.
    grant(loot) {
      for (const r of normalizeRows(loot)) rows.set(r.item_id, (rows.get(r.item_id) ?? 0) + r.qty);
      return { credited: 1, loot: normalizeRows(loot) };
    },
  };
  return api;
}
