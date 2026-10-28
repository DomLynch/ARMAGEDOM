// A mock of the market adapter (engine/market-api.js) with the same four calls and shapes, plus the server's rules as the contract states
// them: a global price list, cash and a carried inventory per player, and request-id replay (the same id answers the first result again).
export function createMockMarket({ cash = 100, items = {}, stock = defaultStock(), errors = {} } = {}) {
  const held = new Map(Object.entries(items)),
    done = new Map(),
    calls = [];
  const list = () => [...held].filter(([, qty]) => qty > 0).map(([itemId, qty]) => ({ itemId, qty }));
  const down = (name) => (errors[name] ? { ok: false, error: errors[name], offline: errors[name] === "offline" } : null);
  function trade(side, shopId, itemId, qty, requestId) {
    calls.push({ side, shopId, itemId, qty, requestId });
    const failure = down(side);
    if (failure) return failure;
    if (done.has(requestId)) return { ...done.get(requestId), replayed: true };
    const row = stock[shopId]?.find((r) => r.itemId === itemId),
      price = side === "buy" ? row?.buyPrice : row?.sellPrice;
    let reply;
    if (!row || price == null) reply = { ok: false, error: "unknown_item", cash, items: list(), replayed: false };
    else if (side === "buy" && price * qty > cash) reply = { ok: false, error: "insufficient_cash", cash, items: list(), replayed: false };
    else if (side === "sell" && (held.get(itemId) ?? 0) < qty) reply = { ok: false, error: "insufficient_qty", cash, items: list(), replayed: false };
    else {
      cash += side === "buy" ? -price * qty : price * qty;
      held.set(itemId, (held.get(itemId) ?? 0) + (side === "buy" ? qty : -qty));
      reply = { ok: true, cash, items: list(), replayed: false };
    }
    done.set(requestId, reply);
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
    scrapper: [
      { itemId: "scrap", name: "Scrap metal", buyPrice: 10, sellPrice: 4 },
      { itemId: "tape", name: "Duct tape", buyPrice: 6, sellPrice: 2 },
      { itemId: "relic", name: "Old relic", buyPrice: null, sellPrice: 30 },
    ],
    medic: [{ itemId: "medkit-pack", name: "Medkit pack", buyPrice: 40, sellPrice: null }],
  };
}
