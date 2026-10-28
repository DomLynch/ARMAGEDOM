// A mock of the market adapter (engine/market-api.js) with the same four calls and shapes, plus the server's rules as
// docs/MARKET-CONTRACT.md states them: one global price list, cash and a carried inventory per player, signed cash deltas, and
// request-id replay (the same id answers the first result again, flagged replayed, with the first call's inventory snapshot).
export function createMockMarket({ cash = 100, items = {}, stock = defaultStock(), errors = {} } = {}) {
  const held = new Map(Object.entries(items)),
    done = new Map(),
    calls = [];
  const list = () =>
    [...held]
      .filter(([, qty]) => qty > 0)
      .map(([itemId, qty]) => ({ itemId, qty }))
      .sort((a, b) => (a.itemId < b.itemId ? -1 : 1)); // the server sorts by item_id
  const down = (name) => (errors[name] ? { ok: false, error: errors[name], offline: errors[name] === "offline" } : null);
  function trade(side, shopId, itemId, qty, requestId) {
    calls.push({ side, shopId, itemId, qty, requestId });
    const failure = down(side);
    if (failure) return failure;
    if (done.has(requestId)) return { ...done.get(requestId), replayed: true };
    const row = stock[shopId]?.find((r) => r.itemId === itemId),
      price = side === "buy" ? row?.buyPrice : row?.sellPrice;
    let reply;
    if (!row || price == null) reply = { ok: false, error: side === "buy" ? "not-for-sale" : "not-bought", delta: 0, items: list(), replayed: false };
    else if (side === "buy" && price * qty > cash) reply = { ok: false, error: "insufficient-cash", delta: 0, items: list(), replayed: false };
    else if (side === "sell" && (held.get(itemId) ?? 0) < qty) reply = { ok: false, error: "insufficient-qty", delta: 0, items: list(), replayed: false };
    else {
      const delta = side === "buy" ? -price * qty : price * qty;
      cash += delta;
      held.set(itemId, (held.get(itemId) ?? 0) + (side === "buy" ? qty : -qty));
      reply = { ok: true, delta, items: list(), replayed: false };
    }
    if (reply.ok) done.set(requestId, reply);
    return reply;
  }
  return {
    calls,
    get cash() {
      return cash;
    },
    carried: (itemId) => held.get(itemId) ?? 0,
    async inventory() {
      return down("inventory") ?? { ok: true, items: list() };
    },
    async stock(shopId) {
      return down("stock") ?? { ok: true, rows: stock[shopId] ?? [] };
    },
    buy: async (...args) => trade("buy", ...args),
    sell: async (...args) => trade("sell", ...args),
  };
}

export function defaultStock() {
  return {
    "hub-trader": [
      { itemId: "ammo-pack", name: "Ammo Pack", buyPrice: 60, sellPrice: 20 },
      { itemId: "medkit-pack", name: "Medkit Pack", buyPrice: 120, sellPrice: 40 },
      { itemId: "vest-patch", name: "Vest Patch", buyPrice: 250, sellPrice: 80 },
      { itemId: "hunter-cpu", name: "Hunter CPU", buyPrice: null, sellPrice: 150 },
      { itemId: "roach-mandibles", name: "Roach Mandibles", buyPrice: null, sellPrice: 40 },
    ],
  };
}
